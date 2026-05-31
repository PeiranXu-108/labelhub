"""add multistage human review metadata

Revision ID: 20260531_0007
Revises: 20260531_0006
Create Date: 2026-05-31 00:07:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260531_0007"
down_revision: str | None = "20260531_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("review_stage", sa.String(length=50), nullable=True))
    op.add_column(
        "human_reviews",
        sa.Column("stage", sa.String(length=50), server_default="initial_review", nullable=False),
    )
    op.add_column(
        "human_reviews",
        sa.Column("round", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column("human_reviews", sa.Column("compared_from_attempt", sa.Integer(), nullable=True))
    op.add_column("human_reviews", sa.Column("compared_to_attempt", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE submissions
        SET review_stage = CASE
            WHEN status IN ('approved', 'exportable') THEN 'final_review'
            WHEN status IN ('ai_passed', 'needs_human_review', 'human_reviewing', 'returned')
                AND attempt > 1 THEN 're_review'
            WHEN status IN ('ai_passed', 'needs_human_review', 'human_reviewing', 'returned')
                THEN 'initial_review'
            ELSE NULL
        END
        """
    )
    bind = op.get_bind()
    reviews = list(
        bind.execute(
            sa.text(
                """
                SELECT id, submission_id, decision, created_at
                FROM human_reviews
                """
            )
        ).mappings()
    )
    for review in reviews:
        attempt_row = (
            bind.execute(
                sa.text(
                    """
                    SELECT attempt
                    FROM submission_attempts
                    WHERE submission_id = :submission_id
                        AND submitted_at <= :review_created_at
                    ORDER BY attempt DESC
                    LIMIT 1
                    """
                ),
                {
                    "submission_id": review["submission_id"],
                    "review_created_at": review["created_at"],
                },
            )
            .mappings()
            .first()
        )
        compared_to_attempt = attempt_row["attempt"] if attempt_row else None
        round_number = compared_to_attempt or 1
        compared_from_attempt = None
        if compared_to_attempt and compared_to_attempt > 1:
            compared_from_attempt = bind.execute(
                sa.text(
                    """
                    SELECT MAX(attempt)
                    FROM submission_attempts
                    WHERE submission_id = :submission_id
                        AND attempt < :compared_to_attempt
                    """
                ),
                {
                    "submission_id": review["submission_id"],
                    "compared_to_attempt": compared_to_attempt,
                },
            ).scalar()

        if review["decision"] == "approve":
            stage = "final_review"
        elif round_number > 1:
            stage = "re_review"
        else:
            stage = "initial_review"

        bind.execute(
            sa.text(
                """
                UPDATE human_reviews
                SET stage = :stage,
                    round = :round,
                    compared_from_attempt = :compared_from_attempt,
                    compared_to_attempt = :compared_to_attempt
                WHERE id = :review_id
                """
            ),
            {
                "stage": stage,
                "round": round_number,
                "compared_from_attempt": compared_from_attempt,
                "compared_to_attempt": compared_to_attempt,
                "review_id": review["id"],
            },
        )


def downgrade() -> None:
    op.drop_column("human_reviews", "compared_to_attempt")
    op.drop_column("human_reviews", "compared_from_attempt")
    op.drop_column("human_reviews", "round")
    op.drop_column("human_reviews", "stage")
    op.drop_column("submissions", "review_stage")
