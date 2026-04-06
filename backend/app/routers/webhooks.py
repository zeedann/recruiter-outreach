import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.sanitize import sanitize_html
from app.models import Candidate, CandidateStateLog, CandidateStatus, Reply, SentEmail
from app.services.classifier import classify_reply
from app.services.referral import handle_referral

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Set this after creating the webhook via the Nylas API
# The webhook_secret is returned in the create response
WEBHOOK_SECRET = settings.nylas_api_key  # Fallback; ideally use a dedicated env var


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    """Verify the Nylas webhook signature."""
    if not signature:
        return False
    expected = hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.get("/nylas")
async def nylas_webhook_verify(challenge: str = ""):
    """Nylas webhook verification - return the challenge parameter as plain text."""
    return PlainTextResponse(challenge)


@router.post("/nylas")
async def nylas_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()

    # Verify webhook signature
    signature = request.headers.get("x-nylas-signature")
    if not verify_webhook_signature(raw_body, signature):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(401, "Invalid webhook signature")

    body = await request.json()

    deltas = body.get("data", [])
    if not isinstance(deltas, list):
        deltas = [deltas]

    for delta in deltas:
        obj = delta.get("object_data", delta)
        msg_id = obj.get("id", "")

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
            continue

        # Store the reply
        reply_body = obj.get("body", obj.get("snippet", ""))
        reply = Reply(
            candidate_id=candidate.id,
            nylas_message_id=msg_id,
            body=sanitize_html(reply_body),
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
