import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models import (
    Candidate,
    CandidateStateLog,
    CandidateStatus,
    SentEmail,
    Sequence,
    SequenceStep,
)
from app.services.nylas_service import nylas_service

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
        # Get all pending candidates -> activate them
        result = await db.execute(
            select(Candidate).where(Candidate.status == CandidateStatus.pending)
        )
        pending = result.scalars().all()
        for c in pending:
            _update_status(db, c, CandidateStatus.active, "Enrolled in sequence")
        if pending:
            await db.commit()

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
                resp = await nylas_service.send_email(
                    grant_id=grant_id,
                    to_email=candidate.email,
                    subject=current_step.subject,
                    body_html=current_step.body_html,
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


async def run_sequence_engine():
    logger.info("Sequence engine started")
    while True:
        try:
            await process_candidates()
        except Exception as e:
            logger.error(f"Sequence engine error: {e}")
        await asyncio.sleep(30)  # Check every 30 seconds
