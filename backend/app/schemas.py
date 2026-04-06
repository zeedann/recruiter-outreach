from datetime import datetime

from pydantic import BaseModel


# --- Recruiter ---
class RecruiterOut(BaseModel):
    id: int
    email: str
    nylas_grant_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Sequence ---
class SequenceStepCreate(BaseModel):
    step_order: int
    subject: str
    body_html: str
    delay_minutes: int = 0


class SequenceStepOut(BaseModel):
    id: int
    step_order: int
    subject: str
    body_html: str
    delay_minutes: int

    class Config:
        from_attributes = True


class SequenceCreate(BaseModel):
    name: str
    steps: list[SequenceStepCreate] = []


class SequenceOut(BaseModel):
    id: int
    recruiter_id: int
    name: str
    created_at: datetime
    steps: list[SequenceStepOut] = []

    class Config:
        from_attributes = True


class SequenceListOut(BaseModel):
    id: int
    recruiter_id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Candidate ---
class CandidateOut(BaseModel):
    id: int
    email: str
    name: str
    sequence_id: int
    current_step: int
    status: str
    enrolled_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CandidateStateLogOut(BaseModel):
    id: int
    from_status: str
    to_status: str
    timestamp: datetime
    note: str | None

    class Config:
        from_attributes = True


# --- Reply ---
class ReplyOut(BaseModel):
    id: int
    candidate_id: int
    nylas_message_id: str | None
    body: str
    classification: str | None
    received_at: datetime

    class Config:
        from_attributes = True


class ReplySend(BaseModel):
    body: str


# --- Sent Email ---
class SentEmailOut(BaseModel):
    id: int
    candidate_id: int
    step_id: int
    nylas_message_id: str | None
    sent_at: datetime

    class Config:
        from_attributes = True


# --- Referral ---
class ReferralOut(BaseModel):
    id: int
    from_candidate_id: int
    referred_email: str
    referred_name: str
    new_candidate_id: int | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Dashboard ---
class SequenceAnalytics(BaseModel):
    sequence_id: int
    sequence_name: str
    total_candidates: int
    sent_count: int
    replied_count: int
    interested_count: int
    not_interested_count: int
    neutral_count: int


class CandidateDetail(BaseModel):
    candidate: CandidateOut
    state_logs: list[CandidateStateLogOut]
    sent_emails: list[SentEmailOut]
    replies: list[ReplyOut]
    referrals: list[ReferralOut] = []
