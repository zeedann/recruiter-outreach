from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import Candidate, Recruiter, Sequence

ALGORITHM = "HS256"
COOKIE_NAME = "session"
MAX_AGE = 30 * 24 * 60 * 60  # 30 days in seconds


def create_token(recruiter_id: int, email: str) -> str:
    payload = {
        "recruiter_id": recruiter_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid session")


async def get_current_recruiter(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Recruiter:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Not authenticated")

    payload = decode_token(token)
    recruiter_id = payload.get("recruiter_id")
    if not recruiter_id:
        raise HTTPException(401, "Invalid session")

    result = await db.execute(select(Recruiter).where(Recruiter.id == recruiter_id))
    recruiter = result.scalar_one_or_none()
    if not recruiter:
        raise HTTPException(401, "Not authenticated")

    return recruiter


async def verify_sequence_ownership(
    sequence_id: int,
    recruiter: Recruiter,
    db: AsyncSession,
) -> Sequence:
    """Verify the recruiter owns this sequence. Returns the sequence or raises 404."""
    result = await db.execute(
        select(Sequence)
        .options(selectinload(Sequence.steps))
        .where(Sequence.id == sequence_id, Sequence.recruiter_id == recruiter.id)
    )
    seq = result.scalar_one_or_none()
    if not seq:
        raise HTTPException(404, "Not found")
    return seq


async def verify_candidate_ownership(
    candidate_id: int,
    recruiter: Recruiter,
    db: AsyncSession,
) -> Candidate:
    """Verify the recruiter owns this candidate (via sequence). Returns the candidate or raises 404."""
    result = await db.execute(
        select(Candidate)
        .join(Sequence)
        .where(Candidate.id == candidate_id, Sequence.recruiter_id == recruiter.id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(404, "Not found")
    return candidate
