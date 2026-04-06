import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Candidate, CandidateStateLog, CandidateStatus, Reply, SentEmail
from app.services.classifier import classify_reply
from app.services.referral import handle_referral

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.get("/nylas")
async def nylas_webhook_verify(challenge: str = ""):
    """Nylas webhook verification - return the challenge parameter."""
    return challenge


@router.post("/nylas")
async def nylas_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    logger.info(f"Webhook received: {body}")

    deltas = body.get("data", [])
    if not isinstance(deltas, list):
        deltas = [deltas]

    for delta in deltas:
        obj = delta.get("object_data", delta)
        msg_id = obj.get("id", "")
        grant_id = delta.get("grant_id", body.get("grant_id", ""))

        # Extract sender email
        from_list = obj.get("from", [])
        if not from_list:
            continue
        sender_email = from_list[0].get("email", "") if isinstance(from_list[0], dict) else from_list[0]

        # Find candidate by email
        result = await db.execute(
            select(Candidate).where(
                Candidate.email == sender_email,
                Candidate.status.in_([CandidateStatus.active, CandidateStatus.pending]),
            )
        )
        candidate = result.scalar_one_or_none()
        if not candidate:
            logger.debug(f"No active candidate found for {sender_email}")
            continue

        # Check if this is a reply to one of our sent emails
        reply_to_ids = obj.get("in_reply_to", [])
        # Also check thread matching
        thread_id = obj.get("thread_id", "")

        # Store the reply
        reply_body = obj.get("body", obj.get("snippet", ""))
        reply = Reply(
            candidate_id=candidate.id,
            nylas_message_id=msg_id,
            body=reply_body,
        )
        db.add(reply)

        # Update candidate status
        old_status = candidate.status
        candidate.status = CandidateStatus.replied
        db.add(
            CandidateStateLog(
                candidate_id=candidate.id,
                from_status=old_status,
                to_status=CandidateStatus.replied,
                note="Candidate replied",
            )
        )

        await db.flush()

        # Classify the reply
        try:
            classification = await classify_reply(reply_body)
            reply.classification = classification.get("classification", "neutral")

            # Map classification to candidate status
            status_map = {
                "interested": CandidateStatus.interested,
                "not_interested": CandidateStatus.not_interested,
                "neutral": CandidateStatus.neutral,
                "referral": CandidateStatus.neutral,
            }
            new_status = status_map.get(reply.classification, CandidateStatus.neutral)
            candidate.status = new_status
            db.add(
                CandidateStateLog(
                    candidate_id=candidate.id,
                    from_status=CandidateStatus.replied,
                    to_status=new_status,
                    note=f"Classified as {reply.classification}",
                )
            )

            # Handle referral if detected
            if classification.get("has_referral") and classification.get("referral_email"):
                await handle_referral(
                    db=db,
                    from_candidate=candidate,
                    referred_email=classification["referral_email"],
                    referred_name=classification.get("referral_name"),
                )
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            reply.classification = "neutral"

    await db.commit()
    return {"status": "ok"}
