"""add upload asset metadata

Revision ID: 20260531_0005
Revises: 20260531_0004
Create Date: 2026-05-31 01:00:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260531_0005"
down_revision: str | None = "20260531_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "upload_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), nullable=True),
        sa.Column("submission_id", sa.String(length=36), nullable=True),
        sa.Column("uploader_id", sa.String(length=36), nullable=False),
        sa.Column("field_id", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"]),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["uploader_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_upload_assets_assignment_id"), "upload_assets", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_upload_assets_field_id"), "upload_assets", ["field_id"], unique=False)
    op.create_index(op.f("ix_upload_assets_submission_id"), "upload_assets", ["submission_id"], unique=False)
    op.create_index(op.f("ix_upload_assets_task_id"), "upload_assets", ["task_id"], unique=False)
    op.create_index(op.f("ix_upload_assets_uploader_id"), "upload_assets", ["uploader_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_upload_assets_uploader_id"), table_name="upload_assets")
    op.drop_index(op.f("ix_upload_assets_task_id"), table_name="upload_assets")
    op.drop_index(op.f("ix_upload_assets_submission_id"), table_name="upload_assets")
    op.drop_index(op.f("ix_upload_assets_field_id"), table_name="upload_assets")
    op.drop_index(op.f("ix_upload_assets_assignment_id"), table_name="upload_assets")
    op.drop_table("upload_assets")
