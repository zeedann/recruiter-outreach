import asyncio
import logging
from datetime import datetime, timedelta
from html import escape as html_escape

from app.sanitize import sanitize_html

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models import (
    Candidate,
    CandidateStateLog,
    CandidateStatus,
    Recruiter,
    Referral,
    Reply,
    SentEmail,
    Sequence,
    SequenceStep,
)
from app.services.classifier import classify_reply
from app.services.nylas_service import nylas_service
from app.services.referral import handle_referral

logger = logging.getLogger(__name__)


async def _get_recruiter_grant_id(db, sequence_id: int) -> str | None:
    from app.models import Recruiter

    result = await db.execute(
        select(Sequence).options(selectinload(Sequence.recruiter)).where(Sequence.id == sequence_id)
    )
    seq = result.scalar_one_or_none()
    if seq and seq.recruiter:
        return seq.recruiter.nylas_grant_id
    return None


def _update_status(db, candidate: Candidate, new_status: CandidateStatus, note: str = ""):
    old = candidate.status
    candidate.status = new_status
    db.add(
        CandidateStateLog(
            candidate_id=candidate.id,
            from_status=old,
            to_status=new_status,
            note=note,
        )
    )


async def process_candidates():
    async with async_session() as db:
        # Only process already-active candidates (activation is manual via API)
        # Get all active candidates
        result = await db.execute(
            select(Candidate)
            .where(Candidate.status == CandidateStatus.active)
            .options(selectinload(Candidate.sent_emails))
        )
        active = result.scalars().all()

        for candidate in active:
            # Get sequence steps
            steps_result = await db.execute(
                select(SequenceStep)
                .where(SequenceStep.sequence_id == candidate.sequence_id)
                .order_by(SequenceStep.step_order)
            )
            steps = steps_result.scalars().all()

            if candidate.current_step >= len(steps):
                # All steps completed
                _update_status(db, candidate, CandidateStatus.neutral, "Sequence completed, no reply")
                await db.commit()
                continue

            current_step = steps[candidate.current_step]

            # Check if we already sent this step
            already_sent = any(
                se.step_id == current_step.id for se in candidate.sent_emails
            )

            if already_sent:
                # Check delay for next step
                last_sent = max(
                    (se for se in candidate.sent_emails if se.step_id == current_step.id),
                    key=lambda se: se.sent_at,
                )
                next_step_idx = candidate.current_step + 1
                if next_step_idx < len(steps):
                    next_step = steps[next_step_idx]
                    if datetime.utcnow() >= last_sent.sent_at + timedelta(minutes=next_step.delay_minutes):
                        candidate.current_step = next_step_idx
                        await db.commit()
                        # Will send on next cycle
                continue

            # Send this step's email
            grant_id = await _get_recruiter_grant_id(db, candidate.sequence_id)
            if not grant_id:
                logger.error(f"No grant_id for sequence {candidate.sequence_id}")
                continue

            try:
                template_vars = {
                    "name": candidate.name or candidate.email.split("@")[0],
                    "email": candidate.email,
                    "company": "",
                }

                # For referral sequences, resolve {{referrer_name}} from the referral record
                ref_result = await db.execute(
                    select(Referral).where(Referral.new_candidate_id == candidate.id)
                )
                referral = ref_result.scalar_one_or_none()
                if referral:
                    from_result = await db.execute(
                        select(Candidate).where(Candidate.id == referral.from_candidate_id)
                    )
                    from_cand = from_result.scalar_one_or_none()
                    template_vars["referrer_name"] = (
                        from_cand.name if from_cand and from_cand.name else referral.referred_name or "Someone"
                    )

                subject = current_step.subject
                body = current_step.body_html
                for key, val in template_vars.items():
                    safe_val = html_escape(val)
                    subject = subject.replace("{{" + key + "}}", val)  # subject is plain text
                    body = body.replace("{{" + key + "}}", safe_val)   # body is HTML, escape

                resp = await nylas_service.send_email(
                    grant_id=grant_id,
                    to_email=candidate.email,
                    subject=subject,
                    body_html=body,
                )
                msg_id = resp.get("data", resp).get("id")
                sent = SentEmail(
                    candidate_id=candidate.id,
                    step_id=current_step.id,
                    nylas_message_id=msg_id,
                )
                db.add(sent)
                logger.info(f"Sent step {current_step.step_order} to {candidate.email}")
            except Exception as e:
                logger.error(f"Failed to send to {candidate.email}: {e}")

        await db.commit()


async def poll_replies():
    """Poll Nylas for new inbound messages and match them to active candidates."""
    async with async_session() as db:
        # Get all recruiters
        result = await db.execute(select(Recruiter))
        recruiters = result.scalars().all()

        for recruiter in recruiters:
            # Check messages from the last 2 minutes
            since = int((datetime.utcnow() - timedelta(minutes=2)).timestamp())
            try:
                messages = await nylas_service.list_recent_messages(
                    grant_id=recruiter.nylas_grant_id,
                    received_after=since,
                )
            except Exception as e:
                logger.error(f"Failed to poll messages for {recruiter.email}: {e}")
                continue

            for msg in messages:
                from_list = msg.get("from", [])
                if not from_list:
                    continue
                sender_email = from_list[0].get("email", "") if isinstance(from_list[0], dict) else str(from_list[0])
                msg_id = msg.get("id", "")

                # Skip if sender is the recruiter themselves
                if sender_email == recruiter.email:
                    continue

                # Find active candidate matching this sender
                result = await db.execute(
                    select(Candidate).where(
                        Candidate.email == sender_email,
                        Candidate.status.in_([
                            CandidateStatus.active,
                            CandidateStatus.pending,
                        ]),
                    )
                )
                candidate = result.scalar_one_or_none()
                if not candidate:
                    continue

                # Check if we already captured this message
                existing = await db.execute(
                    select(Reply).where(Reply.nylas_message_id == msg_id)
                )
                if existing.scalar_one_or_none():
                    continue

                # Store reply
                reply_body = msg.get("body", msg.get("snippet", ""))
                reply = Reply(
                    candidate_id=candidate.id,
                    nylas_message_id=msg_id,
                    body=sanitize_html(reply_body),
                )
                db.add(reply)

                old_status = candidate.status
                candidate.status = CandidateStatus.replied
                db.add(CandidateStateLog(
                    candidate_id=candidate.id,
                    from_status=old_status,
                    to_status=CandidateStatus.replied,
                    note="Candidate replied",
                ))
                await db.flush()

                logger.info(f"Captured reply from {sender_email}")

                # Classify
                try:
                    classification = await classify_reply(reply_body)
                    reply.classification = classification.get("classification", "neutral")

                    status_map = {
                        "interested": CandidateStatus.interested,
                        "not_interested": CandidateStatus.not_interested,
                        "neutral": CandidateStatus.neutral,
                        "referral": CandidateStatus.neutral,
                    }
                    new_status = status_map.get(reply.classification, CandidateStatus.neutral)
                    candidate.status = new_status
                    db.add(CandidateStateLog(
                        candidate_id=candidate.id,
                        from_status=CandidateStatus.replied,
                        to_status=new_status,
                        note=f"Classified as {reply.classification}",
                    ))

                    # Handle referral
                    if classification.get("has_referral") and classification.get("referral_email"):
                        await handle_referral(
                            db=db,
                            from_candidate=candidate,
                            referred_email=classification["referral_email"],
                            referred_name=classification.get("referral_name"),
                        )
                except Exception as e:
                    logger.error(f"Classification failed for {sender_email}: {e}")
                    reply.classification = "neutral"

        await db.commit()


async def run_sequence_engine():
    logger.info("Sequence engine started (with reply polling)")
    while True:
        try:
            await process_candidates()
        except Exception as e:
            logger.error(f"Sequence engine error: {e}")
        try:
            await poll_replies()
        except Exception as e:
            logger.error(f"Reply polling error: {e}")
        await asyncio.sleep(30)  # Check every 30 seconds
