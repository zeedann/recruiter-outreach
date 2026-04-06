"""initial

Revision ID: 001
Revises:
Create Date: 2024-01-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recruiters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("nylas_grant_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "sequences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recruiter_id", sa.Integer(), sa.ForeignKey("recruiters.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "sequence_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sequence_id", sa.Integer(), sa.ForeignKey("sequences.id"), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("delay_minutes", sa.Integer(), default=0),
    )

    candidate_status = sa.Enum(
        "pending", "active", "replied", "interested",
        "not_interested", "neutral", "referred",
        name="candidatestatus",
    )

    op.create_table(
        "candidates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), default=""),
        sa.Column("sequence_id", sa.Integer(), sa.ForeignKey("sequences.id"), nullable=False),
        sa.Column("current_step", sa.Integer(), default=0),
        sa.Column("status", candidate_status, default="pending"),
        sa.Column("enrolled_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "candidate_state_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("from_status", sa.String(50), nullable=False),
        sa.Column("to_status", sa.String(50), nullable=False),
        sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("note", sa.Text(), nullable=True),
    )

    op.create_table(
        "sent_emails",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("step_id", sa.Integer(), sa.ForeignKey("sequence_steps.id"), nullable=False),
        sa.Column("nylas_message_id", sa.String(255), nullable=True),
        sa.Column("sent_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "replies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("nylas_message_id", sa.String(255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("classification", sa.String(50), nullable=True),
        sa.Column("received_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "referrals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("from_candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("referred_email", sa.String(255), nullable=False),
        sa.Column("referred_name", sa.String(255), default=""),
        sa.Column("new_candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("referrals")
    op.drop_table("replies")
    op.drop_table("sent_emails")
    op.drop_table("candidate_state_logs")
    op.drop_table("candidates")
    op.drop_table("sequence_steps")
    op.drop_table("sequences")
    op.drop_table("recruiters")
    op.execute("DROP TYPE IF EXISTS candidatestatus")
