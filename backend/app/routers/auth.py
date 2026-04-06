import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import COOKIE_NAME, MAX_AGE, create_token, get_current_recruiter
from app.config import settings
from app.database import get_db
from app.models import Recruiter
from app.schemas import RecruiterOut
from app.services.nylas_service import nylas_service

logger = logging.getLogger(__name__)
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
    logger.info(f"OAuth callback: email={email}")

    # Upsert recruiter
    result = await db.execute(select(Recruiter).where(Recruiter.email == email))
    recruiter = result.scalar_one_or_none()
    if recruiter:
        recruiter.nylas_grant_id = grant_id
    else:
        recruiter = Recruiter(email=email, nylas_grant_id=grant_id)
        db.add(recruiter)

    await db.commit()
    await db.refresh(recruiter)

    # Create JWT and set cookie
    token = create_token(recruiter.id, recruiter.email)
    response = RedirectResponse(f"{settings.frontend_url}?connected=true")
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
    )
    return response


@router.get("/me")
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException as _HTTPException
    try:
        recruiter = await get_current_recruiter(request, db)
        return RecruiterOut.model_validate(recruiter)
    except _HTTPException:
        # 401 from missing/invalid cookie — user is not logged in
        return None
    except Exception:
        logger.exception("Unexpected error in /me endpoint")
        return None


@router.post("/logout")
async def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return response
