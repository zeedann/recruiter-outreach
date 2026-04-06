from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Candidate, CandidateStatus, Reply, SentEmail, Sequence
from app.schemas import SequenceAnalytics

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/analytics", response_model=list[SequenceAnalytics])
async def get_analytics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sequence))
    sequences = result.scalars().all()

    analytics = []
    for seq in sequences:
        # Total candidates
        total_result = await db.execute(
            select(func.count(Candidate.id)).where(Candidate.sequence_id == seq.id)
        )
        total = total_result.scalar() or 0

        # Sent count
        sent_result = await db.execute(
            select(func.count(SentEmail.id)).where(
                SentEmail.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                )
            )
        )
        sent = sent_result.scalar() or 0

        # Replied count
        replied_result = await db.execute(
            select(func.count(Reply.id)).where(
                Reply.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                ),
                Reply.classification != "recruiter_reply",
            )
        )
        replied = replied_result.scalar() or 0

        # Status counts
        status_counts = {}
        for status in [CandidateStatus.interested, CandidateStatus.not_interested, CandidateStatus.neutral]:
            count_result = await db.execute(
                select(func.count(Candidate.id)).where(
                    Candidate.sequence_id == seq.id,
                    Candidate.status == status,
                )
            )
            status_counts[status.value] = count_result.scalar() or 0

        analytics.append(
            SequenceAnalytics(
                sequence_id=seq.id,
                sequence_name=seq.name,
                total_candidates=total,
                sent_count=sent,
                replied_count=replied,
                interested_count=status_counts.get("interested", 0),
                not_interested_count=status_counts.get("not_interested", 0),
                neutral_count=status_counts.get("neutral", 0),
            )
        )

    return analytics
