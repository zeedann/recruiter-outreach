import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_recruiter, verify_candidate_ownership, verify_sequence_ownership
from app.database import get_db
from app.models import Candidate, CandidateStateLog, CandidateStatus, Recruiter, Referral, Sequence
from app.schemas import (
    BulkAction,
    CandidateDetail,
    CandidateOut,
    CandidateStateLogOut,
    ReferralOut,
    ReplyOut,
    SentEmailOut,
)

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.post("/upload/{sequence_id}", response_model=list[CandidateOut])
async def upload_csv(
    sequence_id: int,
    file: UploadFile = File(...),
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_sequence_ownership(sequence_id, recruiter, db)

    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    candidates = []
    for row in reader:
        email = row.get("email", "").strip()
        name = row.get("name", "").strip()
        if not email:
            continue

        existing = await db.execute(
            select(Candidate).where(
                Candidate.email == email,
                Candidate.sequence_id == sequence_id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        c = Candidate(
            email=email,
            name=name,
            sequence_id=sequence_id,
            status=CandidateStatus.pending,
        )
        db.add(c)
        candidates.append(c)

    await db.commit()
    for c in candidates:
        await db.refresh(c)
    return candidates


@router.get("/sequence/{sequence_id}", response_model=list[CandidateOut])
async def list_candidates(
    sequence_id: int,
    search: str = Query(default="", description="Search by email or name"),
    status: str = Query(default="", description="Filter by status"),
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_sequence_ownership(sequence_id, recruiter, db)

    query = select(Candidate).where(Candidate.sequence_id == sequence_id)

    if search:
        query = query.where(
            or_(
                Candidate.email.ilike(f"%{search}%"),
                Candidate.name.ilike(f"%{search}%"),
            )
        )

    if status:
        try:
            status_enum = CandidateStatus(status)
            query = query.where(Candidate.status == status_enum)
        except ValueError:
            pass

    query = query.order_by(Candidate.enrolled_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{candidate_id}", response_model=CandidateDetail)
async def get_candidate(
    candidate_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_candidate_ownership(candidate_id, recruiter, db)

    result = await db.execute(
        select(Candidate)
        .options(
            selectinload(Candidate.state_logs),
            selectinload(Candidate.sent_emails),
            selectinload(Candidate.replies),
        )
        .where(Candidate.id == candidate_id)
    )
    candidate = result.scalar_one()

    ref_result = await db.execute(
        select(Referral).where(Referral.from_candidate_id == candidate_id)
    )
    referrals = ref_result.scalars().all()

    return CandidateDetail(
        candidate=CandidateOut.model_validate(candidate),
        state_logs=[CandidateStateLogOut.model_validate(l) for l in candidate.state_logs],
        sent_emails=[SentEmailOut.model_validate(e) for e in candidate.sent_emails],
        replies=[ReplyOut.model_validate(r) for r in candidate.replies],
        referrals=[ReferralOut.model_validate(r) for r in referrals],
    )


@router.post("/start/{sequence_id}")
async def start_sequence(
    sequence_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_sequence_ownership(sequence_id, recruiter, db)

    result = await db.execute(
        select(Candidate).where(
            Candidate.sequence_id == sequence_id,
            Candidate.status == CandidateStatus.pending,
        )
    )
    pending = result.scalars().all()
    if not pending:
        return {"ok": True, "activated": 0}

    for c in pending:
        old = c.status
        c.status = CandidateStatus.active
        db.add(CandidateStateLog(
            candidate_id=c.id,
            from_status=old,
            to_status=CandidateStatus.active,
            note="Sequence started manually",
        ))

    await db.commit()
    return {"ok": True, "activated": len(pending)}


@router.delete("/{candidate_id}")
async def delete_candidate(
    candidate_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    candidate = await verify_candidate_ownership(candidate_id, recruiter, db)
    await db.delete(candidate)
    await db.commit()
    return {"ok": True}


@router.post("/bulk-action")
async def bulk_action(
    data: BulkAction,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    # Only fetch candidates that belong to this recruiter
    result = await db.execute(
        select(Candidate)
        .join(Sequence)
        .where(
            Candidate.id.in_(data.candidate_ids),
            Sequence.recruiter_id == recruiter.id,
        )
    )
    candidates = result.scalars().all()

    if data.action == "delete":
        for c in candidates:
            await db.delete(c)
    else:
        try:
            new_status = CandidateStatus(data.action)
            for c in candidates:
                old = c.status
                c.status = new_status
                db.add(CandidateStateLog(
                    candidate_id=c.id,
                    from_status=old,
                    to_status=new_status,
                    note="Bulk action",
                ))
        except ValueError:
            raise HTTPException(400, f"Invalid action: {data.action}")

    await db.commit()
    return {"ok": True, "affected": len(candidates)}
