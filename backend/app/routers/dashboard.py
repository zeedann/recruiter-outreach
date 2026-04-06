from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_recruiter
from app.database import get_db
from app.models import (
    Candidate,
    Recruiter,
    CandidateStateLog,
    CandidateStatus,
    Reply,
    SentEmail,
    Sequence,
)
from app.schemas import (
    DailyActivity,
    FunnelData,
    RecentActivityItem,
    SequenceAnalytics,
    SequenceComparison,
    StatusDistribution,
    TimeToReplyStats,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/analytics", response_model=list[SequenceAnalytics])
async def get_analytics(
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Sequence).where(Sequence.recruiter_id == recruiter.id)
    )
    sequences = result.scalars().all()

    analytics = []
    for seq in sequences:
        total_result = await db.execute(
            select(func.count(Candidate.id)).where(Candidate.sequence_id == seq.id)
        )
        total = total_result.scalar() or 0

        sent_result = await db.execute(
            select(func.count(SentEmail.id)).where(
                SentEmail.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                )
            )
        )
        sent = sent_result.scalar() or 0

        replied_result = await db.execute(
            select(func.count(Reply.id)).where(
                Reply.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                ),
                Reply.classification != "recruiter_reply",
            )
        )
        replied = replied_result.scalar() or 0

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


@router.get("/funnel", response_model=FunnelData)
async def get_funnel(
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    my_candidates = select(Candidate.id).join(Sequence).where(Sequence.recruiter_id == recruiter.id)
    total = (await db.execute(
        select(func.count(Candidate.id)).join(Sequence).where(Sequence.recruiter_id == recruiter.id)
    )).scalar() or 0
    emails_sent = (await db.execute(
        select(func.count(SentEmail.id)).where(SentEmail.candidate_id.in_(my_candidates))
    )).scalar() or 0
    unique_emailed = (await db.execute(
        select(func.count(func.distinct(SentEmail.candidate_id))).where(SentEmail.candidate_id.in_(my_candidates))
    )).scalar() or 0
    replied = (await db.execute(
        select(func.count(func.distinct(Reply.candidate_id))).where(
            Reply.candidate_id.in_(my_candidates),
            Reply.classification != "recruiter_reply",
        )
    )).scalar() or 0
    interested = (await db.execute(
        select(func.count(Candidate.id)).join(Sequence).where(
            Sequence.recruiter_id == recruiter.id,
            Candidate.status == CandidateStatus.interested,
        )
    )).scalar() or 0

    return FunnelData(
        total_candidates=total,
        emails_sent=emails_sent,
        unique_candidates_emailed=unique_emailed,
        replied=replied,
        interested=interested,
        reply_rate=round((replied / unique_emailed * 100) if unique_emailed > 0 else 0, 1),
        interest_rate=round((interested / replied * 100) if replied > 0 else 0, 1),
    )


@router.get("/response-over-time", response_model=list[DailyActivity])
async def get_response_over_time(
    days: int = Query(default=30, ge=1, le=90),
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    results = []

    for i in range(days):
        day = since + timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        sent = (await db.execute(
            select(func.count(SentEmail.id)).where(
                SentEmail.sent_at >= day_start,
                SentEmail.sent_at < day_end,
            )
        )).scalar() or 0

        replied = (await db.execute(
            select(func.count(Reply.id)).where(
                Reply.received_at >= day_start,
                Reply.received_at < day_end,
                Reply.classification != "recruiter_reply",
            )
        )).scalar() or 0

        interested_changes = (await db.execute(
            select(func.count(CandidateStateLog.id)).where(
                CandidateStateLog.timestamp >= day_start,
                CandidateStateLog.timestamp < day_end,
                CandidateStateLog.to_status == "interested",
            )
        )).scalar() or 0

        results.append(DailyActivity(
            date=day_start.strftime("%Y-%m-%d"),
            sent=sent,
            replied=replied,
            interested=interested_changes,
        ))

    return results


@router.get("/time-to-reply", response_model=TimeToReplyStats)
async def get_time_to_reply(
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    # Get all replies with their earliest sent email time
    result = await db.execute(
        select(Reply, func.min(SentEmail.sent_at).label("first_sent"))
        .join(SentEmail, SentEmail.candidate_id == Reply.candidate_id)
        .where(Reply.classification != "recruiter_reply")
        .group_by(Reply.id)
    )
    rows = result.all()

    if not rows:
        return TimeToReplyStats(
            avg_minutes=0, median_minutes=0, p90_minutes=0, total_replies=0
        )

    deltas = []
    for reply, first_sent in rows:
        if first_sent and reply.received_at:
            diff = (reply.received_at - first_sent).total_seconds() / 60
            if diff > 0:
                deltas.append(diff)

    if not deltas:
        return TimeToReplyStats(
            avg_minutes=0, median_minutes=0, p90_minutes=0, total_replies=0
        )

    deltas.sort()
    avg = sum(deltas) / len(deltas)
    median = deltas[len(deltas) // 2]
    p90 = deltas[int(len(deltas) * 0.9)]

    return TimeToReplyStats(
        avg_minutes=round(avg, 1),
        median_minutes=round(median, 1),
        p90_minutes=round(p90, 1),
        total_replies=len(deltas),
    )


@router.get("/status-distribution", response_model=list[StatusDistribution])
async def get_status_distribution(
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count(Candidate.id)))).scalar() or 0
    if total == 0:
        return []

    results = []
    for status in CandidateStatus:
        count = (await db.execute(
            select(func.count(Candidate.id)).where(Candidate.status == status)
        )).scalar() or 0
        if count > 0:
            results.append(StatusDistribution(
                status=status.value,
                count=count,
                percentage=round(count / total * 100, 1),
            ))

    return results


@router.get("/recent-activity", response_model=list[RecentActivityItem])
async def get_recent_activity(
    limit: int = Query(default=20, ge=1, le=100),
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    activities: list[RecentActivityItem] = []

    # Recent sent emails
    sent_result = await db.execute(
        select(SentEmail)
        .options(selectinload(SentEmail.candidate))
        .order_by(SentEmail.sent_at.desc())
        .limit(limit)
    )
    for sent in sent_result.scalars():
        c = sent.candidate
        activities.append(RecentActivityItem(
            type="sent",
            candidate_email=c.email,
            candidate_name=c.name or c.email,
            detail=f"Step {sent.step_id} email sent",
            timestamp=sent.sent_at,
        ))

    # Recent replies
    reply_result = await db.execute(
        select(Reply)
        .options(selectinload(Reply.candidate))
        .where(Reply.classification != "recruiter_reply")
        .order_by(Reply.received_at.desc())
        .limit(limit)
    )
    for reply in reply_result.scalars():
        c = reply.candidate
        classification = reply.classification or "unclassified"
        activities.append(RecentActivityItem(
            type="reply",
            candidate_email=c.email,
            candidate_name=c.name or c.email,
            detail=f"Replied - classified as {classification}",
            timestamp=reply.received_at,
        ))

    # Recent status changes
    log_result = await db.execute(
        select(CandidateStateLog)
        .options(selectinload(CandidateStateLog.candidate))
        .order_by(CandidateStateLog.timestamp.desc())
        .limit(limit)
    )
    for log in log_result.scalars():
        c = log.candidate
        activities.append(RecentActivityItem(
            type="status_change",
            candidate_email=c.email,
            candidate_name=c.name or c.email,
            detail=f"{log.from_status} -> {log.to_status}",
            timestamp=log.timestamp,
        ))

    # Sort all by timestamp desc and return top N
    activities.sort(key=lambda a: a.timestamp, reverse=True)
    return activities[:limit]


@router.get("/sequence-comparison", response_model=list[SequenceComparison])
async def get_sequence_comparison(
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Sequence).where(Sequence.recruiter_id == recruiter.id)
    )
    sequences = result.scalars().all()

    comparisons = []
    for seq in sequences:
        total = (await db.execute(
            select(func.count(Candidate.id)).where(Candidate.sequence_id == seq.id)
        )).scalar() or 0

        sent = (await db.execute(
            select(func.count(SentEmail.id)).where(
                SentEmail.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                )
            )
        )).scalar() or 0

        reply_count = (await db.execute(
            select(func.count(Reply.id)).where(
                Reply.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                ),
                Reply.classification != "recruiter_reply",
            )
        )).scalar() or 0

        interested = (await db.execute(
            select(func.count(Candidate.id)).where(
                Candidate.sequence_id == seq.id,
                Candidate.status == CandidateStatus.interested,
            )
        )).scalar() or 0

        comparisons.append(SequenceComparison(
            sequence_id=seq.id,
            sequence_name=seq.name,
            total_candidates=total,
            emails_sent=sent,
            reply_count=reply_count,
            reply_rate=round((reply_count / total * 100) if total > 0 else 0, 1),
            interested_count=interested,
            interest_rate=round((interested / total * 100) if total > 0 else 0, 1),
        ))

    return comparisons
