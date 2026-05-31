"""add llm field assist logs

Revision ID: 20260531_0006
Revises: 20260531_0005
Create Date: 2026-05-31 02:00:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260531_0006"
down_revision: str | None = "20260531_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "llm_field_assist_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), nullable=False),
        sa.Column("submission_id", sa.String(length=36), nullable=False),
        sa.Column("template_schema_id", sa.String(length=36), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=False),
        sa.Column("actor_role", sa.String(length=50), nullable=False),
        sa.Column("trigger_field_id", sa.String(length=64), nullable=False),
        sa.Column("target_field_id", sa.String(length=64), nullable=False),
        sa.Column("mode", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("prompt_snapshot", sa.Text(), nullable=True),
        sa.Column("output_schema", sa.JSON(), nullable=False),
        sa.Column("structured_response", sa.JSON(), nullable=True),
        sa.Column("raw_provider_response", sa.JSON(), nullable=True),
        sa.Column("provider_metadata", sa.JSON(), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"]),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["template_schema_id"], ["template_schemas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_llm_field_assist_logs_actor_id"), "llm_field_assist_logs", ["actor_id"], unique=False)
    op.create_index(op.f("ix_llm_field_assist_logs_assignment_id"), "llm_field_assist_logs", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_llm_field_assist_logs_submission_id"), "llm_field_assist_logs", ["submission_id"], unique=False)
    op.create_index(op.f("ix_llm_field_assist_logs_target_field_id"), "llm_field_assist_logs", ["target_field_id"], unique=False)
    op.create_index(op.f("ix_llm_field_assist_logs_task_id"), "llm_field_assist_logs", ["task_id"], unique=False)
    op.create_index(op.f("ix_llm_field_assist_logs_template_schema_id"), "llm_field_assist_logs", ["template_schema_id"], unique=False)
    op.create_index(op.f("ix_llm_field_assist_logs_trigger_field_id"), "llm_field_assist_logs", ["trigger_field_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_llm_field_assist_logs_trigger_field_id"), table_name="llm_field_assist_logs")
    op.drop_index(op.f("ix_llm_field_assist_logs_template_schema_id"), table_name="llm_field_assist_logs")
    op.drop_index(op.f("ix_llm_field_assist_logs_task_id"), table_name="llm_field_assist_logs")
    op.drop_index(op.f("ix_llm_field_assist_logs_target_field_id"), table_name="llm_field_assist_logs")
    op.drop_index(op.f("ix_llm_field_assist_logs_submission_id"), table_name="llm_field_assist_logs")
    op.drop_index(op.f("ix_llm_field_assist_logs_assignment_id"), table_name="llm_field_assist_logs")
    op.drop_index(op.f("ix_llm_field_assist_logs_actor_id"), table_name="llm_field_assist_logs")
    op.drop_table("llm_field_assist_logs")
