import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    CandidateStateLog,
    CandidateStatus,
    Referral,
    Sequence,
    SequenceStep,
)

logger = logging.getLogger(__name__)

REFERRAL_SEQUENCE_NAME = "Thanks for Referral"


async def get_or_create_referral_sequence(db: AsyncSession, recruiter_id: int) -> Sequence:
    result = await db.execute(
        select(Sequence).where(
            Sequence.recruiter_id == recruiter_id,
            Sequence.name == REFERRAL_SEQUENCE_NAME,
        )
    )
    seq = result.scalar_one_or_none()
    if seq:
        return seq

    seq = Sequence(recruiter_id=recruiter_id, name=REFERRAL_SEQUENCE_NAME)
    db.add(seq)
    await db.flush()

    step = SequenceStep(
        sequence_id=seq.id,
        step_order=0,
        subject="{{referrer_name}} suggested we connect",
        body_html=(
            "<p>Hi,</p>"
            "<p>{{referrer_name}} mentioned you might be a great fit for a role "
            "we're working on. I'd love to share more details if you're open to it.</p>"
            "<p>Would you have 15 minutes for a quick chat this week?</p>"
            "<p>Best regards</p>"
        ),
        delay_minutes=0,
    )
    db.add(step)
    await db.flush()
    return seq


async def handle_referral(
    db: AsyncSession,
    from_candidate: Candidate,
    referred_email: str,
    referred_name: str | None,
) -> Candidate | None:
    if not referred_email:
        return None

    # Get recruiter_id from the sequence
    result = await db.execute(
        select(Sequence).where(Sequence.id == from_candidate.sequence_id)
    )
    sequence = result.scalar_one()

    referral_seq = await get_or_create_referral_sequence(db, sequence.recruiter_id)

    new_candidate = Candidate(
        email=referred_email,
        name=referred_name or "",
        sequence_id=referral_seq.id,
        current_step=0,
        status=CandidateStatus.pending,
    )
    db.add(new_candidate)
    await db.flush()

    # Update original candidate status
    old_status = from_candidate.status
    from_candidate.status = CandidateStatus.referred
    db.add(
        CandidateStateLog(
            candidate_id=from_candidate.id,
            from_status=old_status,
            to_status=CandidateStatus.referred,
            note=f"Referred {referred_email}",
        )
    )

    referral = Referral(
        from_candidate_id=from_candidate.id,
        referred_email=referred_email,
        referred_name=referred_name or "",
        new_candidate_id=new_candidate.id,
    )
    db.add(referral)
    await db.flush()

    logger.info(f"Created referral: {from_candidate.email} -> {referred_email}")
    return new_candidate
