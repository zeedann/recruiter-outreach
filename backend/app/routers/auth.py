from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Recruiter
from app.schemas import RecruiterOut
from app.services.nylas_service import nylas_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/connect")
async def connect():
    url = nylas_service.get_auth_url(settings.nylas_callback_uri)
    return RedirectResponse(url)


@router.get("/callback")
async def callback(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    token_data = await nylas_service.exchange_code(code, settings.nylas_callback_uri)
    grant_id = token_data.get("grant_id", "")
    email = token_data.get("email", "")

    # Upsert recruiter
    result = await db.execute(select(Recruiter).where(Recruiter.email == email))
    recruiter = result.scalar_one_or_none()
    if recruiter:
        recruiter.nylas_grant_id = grant_id
    else:
        recruiter = Recruiter(email=email, nylas_grant_id=grant_id)
        db.add(recruiter)

    await db.commit()
    return RedirectResponse(f"{settings.frontend_url}?connected=true")


@router.get("/me", response_model=RecruiterOut | None)
async def get_me(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recruiter).order_by(Recruiter.id.desc()).limit(1))
    return result.scalar_one_or_none()


@router.get("/recruiters", response_model=list[RecruiterOut])
async def list_recruiters(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recruiter).order_by(Recruiter.id.desc()))
    return result.scalars().all()
