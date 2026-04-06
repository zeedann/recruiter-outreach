import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Candidate, CandidateStateLog, CandidateStatus, Referral, Sequence
from app.schemas import CandidateDetail, CandidateOut, CandidateStateLogOut, ReferralOut, ReplyOut, SentEmailOut

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.post("/upload/{sequence_id}", response_model=list[CandidateOut])
async def upload_csv(
    sequence_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Sequence).where(Sequence.id == sequence_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Sequence not found")

    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    candidates = []
    for row in reader:
        email = row.get("email", "").strip()
        name = row.get("name", "").strip()
        if not email:
            continue

        # Skip duplicates in same sequence
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
async def list_candidates(sequence_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Candidate)
        .where(Candidate.sequence_id == sequence_id)
        .order_by(Candidate.enrolled_at.desc())
    )
    return result.scalars().all()


@router.get("/{candidate_id}", response_model=CandidateDetail)
async def get_candidate(candidate_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Candidate)
        .options(
            selectinload(Candidate.state_logs),
            selectinload(Candidate.sent_emails),
            selectinload(Candidate.replies),
        )
        .where(Candidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(404, "Candidate not found")

    # Get referrals
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
