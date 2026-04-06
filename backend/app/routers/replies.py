from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_recruiter, verify_candidate_ownership
from app.database import get_db
from app.sanitize import sanitize_html
from app.models import Candidate, Recruiter, Reply, Sequence
from app.schemas import ReplyOut, ReplySend
from app.services.nylas_service import nylas_service

router = APIRouter(prefix="/api/replies", tags=["replies"])


@router.get("/candidate/{candidate_id}", response_model=list[ReplyOut])
async def list_replies(
    candidate_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_candidate_ownership(candidate_id, recruiter, db)

    result = await db.execute(
        select(Reply)
        .where(Reply.candidate_id == candidate_id)
        .order_by(Reply.received_at.asc())
    )
    return result.scalars().all()


@router.post("/candidate/{candidate_id}/send", response_model=ReplyOut)
async def send_reply(
    candidate_id: int,
    data: ReplySend,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_candidate_ownership(candidate_id, recruiter, db)

    result = await db.execute(
        select(Candidate)
        .options(selectinload(Candidate.replies))
        .where(Candidate.id == candidate_id)
    )
    candidate = result.scalar_one()

    grant_id = recruiter.nylas_grant_id

    last_reply = None
    if candidate.replies:
        last_reply = max(candidate.replies, key=lambda r: r.received_at)

    if last_reply and last_reply.nylas_message_id:
        resp = await nylas_service.reply_to_message(
            grant_id=grant_id,
            message_id=last_reply.nylas_message_id,
            body_html=data.body,
        )
    else:
        resp = await nylas_service.send_email(
            grant_id=grant_id,
            to_email=candidate.email,
            subject="Re: Following up",
            body_html=data.body,
        )

    msg_data = resp.get("data", resp)
    reply = Reply(
        candidate_id=candidate_id,
        nylas_message_id=msg_data.get("id"),
        body=sanitize_html(data.body),
        classification="recruiter_reply",
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return reply
