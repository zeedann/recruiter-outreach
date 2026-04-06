from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Recruiter, Sequence, SequenceStep
from app.schemas import SequenceCreate, SequenceListOut, SequenceOut, SequenceStepCreate, SequenceStepOut

router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.post("/", response_model=SequenceOut)
async def create_sequence(
    data: SequenceCreate,
    recruiter_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    # Verify recruiter exists
    result = await db.execute(select(Recruiter).where(Recruiter.id == recruiter_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Recruiter not found")

    seq = Sequence(recruiter_id=recruiter_id, name=data.name)
    db.add(seq)
    await db.flush()

    for step_data in data.steps:
        step = SequenceStep(
            sequence_id=seq.id,
            step_order=step_data.step_order,
            subject=step_data.subject,
            body_html=step_data.body_html,
            delay_minutes=step_data.delay_minutes,
        )
        db.add(step)

    await db.commit()

    # Reload with steps
    result = await db.execute(
        select(Sequence).options(selectinload(Sequence.steps)).where(Sequence.id == seq.id)
    )
    return result.scalar_one()


@router.get("/", response_model=list[SequenceListOut])
async def list_sequences(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sequence).order_by(Sequence.created_at.desc()))
    return result.scalars().all()


@router.get("/{sequence_id}", response_model=SequenceOut)
async def get_sequence(sequence_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Sequence).options(selectinload(Sequence.steps)).where(Sequence.id == sequence_id)
    )
    seq = result.scalar_one_or_none()
    if not seq:
        raise HTTPException(404, "Sequence not found")
    return seq


@router.post("/{sequence_id}/steps", response_model=SequenceStepOut)
async def add_step(
    sequence_id: int,
    data: SequenceStepCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Sequence).where(Sequence.id == sequence_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Sequence not found")

    step = SequenceStep(
        sequence_id=sequence_id,
        step_order=data.step_order,
        subject=data.subject,
        body_html=data.body_html,
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
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SequenceStep).where(SequenceStep.id == step_id))
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Step not found")

    step.step_order = data.step_order
    step.subject = data.subject
    step.body_html = data.body_html
    step.delay_minutes = data.delay_minutes
    await db.commit()
    await db.refresh(step)
    return step


@router.delete("/steps/{step_id}")
async def delete_step(step_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SequenceStep).where(SequenceStep.id == step_id))
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Step not found")
    await db.delete(step)
    await db.commit()
    return {"ok": True}
