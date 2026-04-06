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
    candidate_count: int = 0
    sent_count: int = 0
    replied_count: int = 0
    reply_rate: float = 0.0

    class Config:
        from_attributes = True


class SequenceUpdate(BaseModel):
    name: str


class ReorderSteps(BaseModel):
    step_ids: list[int]


class BulkAction(BaseModel):
    candidate_ids: list[int]
    action: str  # "delete" or a status value


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


# --- Extended Dashboard Analytics ---
class FunnelData(BaseModel):
    total_candidates: int
    emails_sent: int
    unique_candidates_emailed: int
    replied: int
    interested: int
    reply_rate: float
    interest_rate: float


class DailyActivity(BaseModel):
    date: str
    sent: int
    replied: int
    interested: int


class TimeToReplyStats(BaseModel):
    avg_minutes: float
    median_minutes: float
    p90_minutes: float
    total_replies: int


class StatusDistribution(BaseModel):
    status: str
    count: int
    percentage: float


class RecentActivityItem(BaseModel):
    type: str  # "sent", "reply", "status_change"
    candidate_email: str
    candidate_name: str
    detail: str
    timestamp: datetime
    sequence_name: str | None = None


class SequenceComparison(BaseModel):
    sequence_id: int
    sequence_name: str
    total_candidates: int
    emails_sent: int
    reply_count: int
    reply_rate: float
    interested_count: int
    interest_rate: float
