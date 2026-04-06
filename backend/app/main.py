import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, candidates, dashboard, replies, sequences, webhooks
from app.services.sequence_engine import run_sequence_engine

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Recruiter Outreach", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sequences.router)
app.include_router(candidates.router)
app.include_router(replies.router)
app.include_router(webhooks.router)
app.include_router(dashboard.router)


@app.on_event("startup")
async def startup():
    asyncio.create_task(run_sequence_engine())


@app.get("/api/health")
async def health():
    return {"status": "ok"}
