from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_recruiter, verify_sequence_ownership
from app.database import get_db
from app.sanitize import sanitize_html
from app.models import Candidate, Recruiter, Reply, SentEmail, Sequence, SequenceStep
from app.schemas import (
    ReorderSteps,
    SequenceCreate,
    SequenceListOut,
    SequenceOut,
    SequenceStepCreate,
    SequenceStepOut,
    SequenceUpdate,
)

router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.post("/", response_model=SequenceOut)
async def create_sequence(
    data: SequenceCreate,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    seq = Sequence(recruiter_id=recruiter.id, name=data.name)
    db.add(seq)
    await db.flush()

    for step_data in data.steps:
        step = SequenceStep(
            sequence_id=seq.id,
            step_order=step_data.step_order,
            subject=step_data.subject,
            body_html=sanitize_html(step_data.body_html),
            delay_minutes=step_data.delay_minutes,
        )
        db.add(step)

    await db.commit()

    result = await db.execute(
        select(Sequence).options(selectinload(Sequence.steps)).where(Sequence.id == seq.id)
    )
    return result.scalar_one()


@router.get("/", response_model=list[SequenceListOut])
async def list_sequences(
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Sequence)
        .where(Sequence.recruiter_id == recruiter.id)
        .order_by(Sequence.created_at.desc())
    )
    sequences = result.scalars().all()

    out = []
    for seq in sequences:
        candidate_count = (await db.execute(
            select(func.count(Candidate.id)).where(Candidate.sequence_id == seq.id)
        )).scalar() or 0

        sent_count = (await db.execute(
            select(func.count(SentEmail.id)).where(
                SentEmail.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                )
            )
        )).scalar() or 0

        replied_count = (await db.execute(
            select(func.count(Reply.id)).where(
                Reply.candidate_id.in_(
                    select(Candidate.id).where(Candidate.sequence_id == seq.id)
                ),
                Reply.classification != "recruiter_reply",
            )
        )).scalar() or 0

        out.append(SequenceListOut(
            id=seq.id,
            recruiter_id=seq.recruiter_id,
            name=seq.name,
            created_at=seq.created_at,
            candidate_count=candidate_count,
            sent_count=sent_count,
            replied_count=replied_count,
            reply_rate=round((replied_count / sent_count * 100) if sent_count > 0 else 0, 1),
        ))

    return out


@router.get("/{sequence_id}", response_model=SequenceOut)
async def get_sequence(
    sequence_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    return await verify_sequence_ownership(sequence_id, recruiter, db)


@router.put("/{sequence_id}", response_model=SequenceOut)
async def update_sequence(
    sequence_id: int,
    data: SequenceUpdate,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    seq = await verify_sequence_ownership(sequence_id, recruiter, db)
    seq.name = data.name
    await db.commit()
    await db.refresh(seq)
    return seq


@router.post("/{sequence_id}/duplicate", response_model=SequenceOut)
async def duplicate_sequence(
    sequence_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    original = await verify_sequence_ownership(sequence_id, recruiter, db)

    new_seq = Sequence(recruiter_id=recruiter.id, name=f"{original.name} (copy)")
    db.add(new_seq)
    await db.flush()

    for step in original.steps:
        new_step = SequenceStep(
            sequence_id=new_seq.id,
            step_order=step.step_order,
            subject=step.subject,
            body_html=step.body_html,
            delay_minutes=step.delay_minutes,
        )
        db.add(new_step)

    await db.commit()

    result = await db.execute(
        select(Sequence).options(selectinload(Sequence.steps)).where(Sequence.id == new_seq.id)
    )
    return result.scalar_one()


@router.post("/{sequence_id}/reorder-steps")
async def reorder_steps(
    sequence_id: int,
    data: ReorderSteps,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_sequence_ownership(sequence_id, recruiter, db)

    result = await db.execute(
        select(SequenceStep).where(SequenceStep.sequence_id == sequence_id)
    )
    steps = {s.id: s for s in result.scalars().all()}

    for order, step_id in enumerate(data.step_ids):
        if step_id in steps:
            steps[step_id].step_order = order

    await db.commit()
    return {"ok": True}


@router.post("/{sequence_id}/steps", response_model=SequenceStepOut)
async def add_step(
    sequence_id: int,
    data: SequenceStepCreate,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    await verify_sequence_ownership(sequence_id, recruiter, db)

    step = SequenceStep(
        sequence_id=sequence_id,
        step_order=data.step_order,
        subject=data.subject,
        body_html=sanitize_html(data.body_html),
        delay_minutes=data.delay_minutes,
    )
    db.add(step)
    await db.commit()
    await db.refresh(step)
    return step


@router.put("/steps/{step_id}", response_model=SequenceStepOut)
async def update_step(
    step_id: int,
    data: SequenceStepCreate,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SequenceStep)
        .join(Sequence)
        .where(SequenceStep.id == step_id, Sequence.recruiter_id == recruiter.id)
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Not found")

    step.step_order = data.step_order
    step.subject = data.subject
    step.body_html = sanitize_html(data.body_html)
    step.delay_minutes = data.delay_minutes
    await db.commit()
    await db.refresh(step)
    return step


@router.delete("/{sequence_id}")
async def delete_sequence(
    sequence_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    seq = await verify_sequence_ownership(sequence_id, recruiter, db)

    candidates = await db.execute(
        select(Candidate).where(Candidate.sequence_id == sequence_id)
    )
    for c in candidates.scalars():
        await db.delete(c)

    steps = await db.execute(
        select(SequenceStep).where(SequenceStep.sequence_id == sequence_id)
    )
    for s in steps.scalars():
        await db.delete(s)

    await db.delete(seq)
    await db.commit()
    return {"ok": True}


@router.delete("/steps/{step_id}")
async def delete_step(
    step_id: int,
    recruiter: Recruiter = Depends(get_current_recruiter),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SequenceStep)
        .join(Sequence)
        .where(SequenceStep.id == step_id, Sequence.recruiter_id == recruiter.id)
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Not found")
    await db.delete(step)
    await db.commit()
    return {"ok": True}
