"""add task metadata and reward rules

Revision ID: 20260531_0004
Revises: 20260528_0003
Create Date: 2026-05-31 00:00:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260531_0004"
down_revision: str | None = "20260528_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("instruction_rich_text", sa.JSON(), nullable=True))
    op.add_column("tasks", sa.Column("instruction_plain_text", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("tags", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    op.add_column(
        "tasks",
        sa.Column(
            "reward_rule",
            sa.JSON(),
            server_default=sa.text("'{\"mode\":\"none\",\"currency\":null,\"amount\":null,\"description\":null}'"),
            nullable=False,
        ),
    )
    op.add_column(
        "tasks",
        sa.Column("quality_rules", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
    )
    bind = op.get_bind()
    bind.exec_driver_sql("UPDATE tasks SET tags = '[]' WHERE tags IS NULL")
    bind.exec_driver_sql(
        "UPDATE tasks SET reward_rule = '{\"mode\":\"none\",\"currency\":null,\"amount\":null,\"description\":null}' "
        "WHERE reward_rule IS NULL"
    )
    bind.exec_driver_sql("UPDATE tasks SET quality_rules = '[]' WHERE quality_rules IS NULL")


def downgrade() -> None:
    op.drop_column("tasks", "quality_rules")
    op.drop_column("tasks", "reward_rule")
    op.drop_column("tasks", "tags")
    op.drop_column("tasks", "instruction_plain_text")
    op.drop_column("tasks", "instruction_rich_text")
