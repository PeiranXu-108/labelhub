import json

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.core.config import get_settings


def _alembic_config() -> Config:
    config = Config("alembic.ini")
    config.set_main_option("script_location", "alembic")
    return config


def test_multistage_migration_backfills_human_review_round_from_snapshot_timestamps(
    tmp_path, monkeypatch
) -> None:
    db_path = tmp_path / "task18_migration.sqlite"
    database_url = f"sqlite+pysqlite:///{db_path}"
    monkeypatch.setenv("LABELHUB_DATABASE_URL", database_url)
    get_settings.cache_clear()
    command.upgrade(_alembic_config(), "20260531_0006")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (id, email, name, role, password_hash)
                VALUES
                    ('owner-1', 'owner@example.com', 'Owner', 'owner', NULL),
                    ('labeler-1', 'labeler@example.com', 'Labeler', 'labeler', NULL),
                    ('reviewer-1', 'reviewer@example.com', 'Reviewer', 'reviewer', NULL)
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO tasks (
                    id, name, description, status, distribution_strategy, quota_per_labeler,
                    deadline_at, created_by, tags, reward_rule, quality_rules
                )
                VALUES (
                    'task-1', 'Task', NULL, 'published', 'manual', NULL, NULL, 'owner-1',
                    :tags, :reward_rule, :quality_rules
                )
                """
            ),
            {
                "tags": json.dumps([]),
                "reward_rule": json.dumps(
                    {"mode": "none", "currency": None, "amount": None, "description": None}
                ),
                "quality_rules": json.dumps([]),
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO task_items (id, task_id, external_id, payload, status)
                VALUES ('item-1', 'task-1', 'row-1', :payload, 'submitted')
                """
            ),
            {"payload": json.dumps({"text": "example"})},
        )
        connection.execute(
            text(
                """
                INSERT INTO assignments (id, task_id, item_id, labeler_id, status)
                VALUES ('assignment-1', 'task-1', 'item-1', 'labeler-1', 'submitted')
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO template_schemas (
                    id, task_id, version, title, schema_payload, is_published, created_by
                )
                VALUES ('schema-1', 'task-1', 1, 'Schema', :schema_payload, 1, 'owner-1')
                """
            ),
            {
                "schema_payload": json.dumps(
                    {
                        "version": 1,
                        "title": "Schema",
                        "layout": {"type": "single", "groups": []},
                        "fields": [],
                        "llmTools": [],
                        "validations": [],
                        "visibilityRules": [],
                    }
                )
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO submissions (
                    id, task_id, item_id, assignment_id, labeler_id, template_schema_id,
                    schema_version, answer_payload, status, attempt, submitted_at
                )
                VALUES (
                    'submission-1', 'task-1', 'item-1', 'assignment-1', 'labeler-1',
                    'schema-1', 1, :answer_payload, 'needs_human_review', 2,
                    '2026-05-31 01:00:00'
                )
                """
            ),
            {"answer_payload": json.dumps({"sentiment": "positive"})},
        )
        connection.execute(
            text(
                """
                INSERT INTO submission_attempts (
                    id, submission_id, attempt, template_schema_id, schema_version,
                    answer_payload, submitted_at, created_at
                )
                VALUES
                    (
                        'attempt-1', 'submission-1', 1, 'schema-1', 1,
                        :first_payload, '2026-05-31 00:00:00', '2026-05-31 00:00:00'
                    ),
                    (
                        'attempt-2', 'submission-1', 2, 'schema-1', 1,
                        :second_payload, '2026-05-31 01:00:00', '2026-05-31 01:00:00'
                    )
                """
            ),
            {
                "first_payload": json.dumps({"sentiment": "negative"}),
                "second_payload": json.dumps({"sentiment": "positive"}),
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO human_reviews (
                    id, submission_id, reviewer_id, decision, reason, metadata, created_at
                )
                VALUES (
                    'review-1', 'submission-1', 'reviewer-1', 'return',
                    'Fix attempt one.', :metadata, '2026-05-31 00:10:00'
                )
                """
            ),
            {"metadata": json.dumps({})},
        )

    command.upgrade(_alembic_config(), "head")

    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT stage, round, compared_from_attempt, compared_to_attempt
                FROM human_reviews
                WHERE id = 'review-1'
                """
            )
        ).mappings().one()

    assert row["stage"] == "initial_review"
    assert row["round"] == 1
    assert row["compared_from_attempt"] is None
    assert row["compared_to_attempt"] == 1
