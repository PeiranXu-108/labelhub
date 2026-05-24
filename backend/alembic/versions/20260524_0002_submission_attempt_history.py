"""create submission attempt history

Revision ID: 20260524_0002
Revises: 20260523_0001
Create Date: 2026-05-24 00:00:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260524_0002"
down_revision: str | None = "20260523_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "submission_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("submission_id", sa.String(length=36), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("template_schema_id", sa.String(length=36), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("answer_payload", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.ForeignKeyConstraint(["template_schema_id"], ["template_schemas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "attempt", name="uq_submission_attempts_submission_attempt"),
    )
    op.create_index(op.f("ix_submission_attempts_submission_id"), "submission_attempts", ["submission_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_submission_attempts_submission_id"), table_name="submission_attempts")
    op.drop_table("submission_attempts")
