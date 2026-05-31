from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import SubmissionStatus, TaskStatus, UserRole
from app.models import Assignment, AuditLog, SubmissionAttempt, Task, TaskItem, TemplateSchema
from tests.conftest import auth_headers


def test_next_claims_safely_and_previous_returns_prior_owned_assignment(
    client: TestClient, db_session: Session
) -> None:
    task_id = _create_navigation_task(db_session, item_count=3)
    first = _claim_assignment(client, task_id)

    next_response = client.post(
        f"/labeler/assignments/{first['id']}/next",
        headers=auth_headers(UserRole.LABELER),
    )

    assert next_response.status_code == 200
    next_payload = next_response.json()
    assert next_payload["assignment"]["item"]["external_id"] == "row-2"
    assert next_payload["assignment"]["template_schema"]["version"] == 1
    assert next_payload["no_work_left"] is False

    previous_response = client.post(
        f"/labeler/assignments/{next_payload['assignment']['id']}/previous",
        headers=auth_headers(UserRole.LABELER),
    )

    assert previous_response.status_code == 200
    previous_payload = previous_response.json()
    assert previous_payload["assignment"]["id"] == first["id"]
    assert previous_payload["assignment"]["item"]["external_id"] == "row-1"


def test_next_reports_no_work_left_without_submitting_current_draft(
    client: TestClient, db_session: Session
) -> None:
    task_id = _create_navigation_task(db_session, item_count=1)
    assignment = _claim_assignment(client, task_id)

    state_response = client.get(
        f"/labeler/assignments/{assignment['id']}/navigation",
        headers=auth_headers(UserRole.LABELER),
    )
    next_response = client.post(
        f"/labeler/assignments/{assignment['id']}/next",
        headers=auth_headers(UserRole.LABELER),
    )

    assert state_response.status_code == 200
    assert state_response.json()["has_next"] is False
    assert state_response.json()["no_work_left"] is True
    assert next_response.status_code == 200
    assert next_response.json()["assignment"] is None
    assert next_response.json()["no_work_left"] is True
    db_assignment = db_session.get(Assignment, assignment["id"])
    assert db_assignment.submission.status == SubmissionStatus.DRAFT
    assert db_assignment.submission.submitted_at is None


def test_skip_is_audited_keeps_submission_draft_and_moves_to_next_assignment(
    client: TestClient, db_session: Session
) -> None:
    task_id = _create_navigation_task(db_session, item_count=2)
    assignment = _claim_assignment(client, task_id)
    draft_response = client.put(
        f"/labeler/assignments/{assignment['id']}/draft",
        headers=auth_headers(UserRole.LABELER),
        json={"answer_payload": {"sentiment": "positive"}},
    )
    assert draft_response.status_code == 200

    skip_response = client.post(
        f"/labeler/assignments/{assignment['id']}/skip",
        headers=auth_headers(UserRole.LABELER),
        json={"reason": "source text is unreadable"},
    )

    assert skip_response.status_code == 200
    payload = skip_response.json()
    assert payload["skipped_assignment_id"] == assignment["id"]
    assert payload["assignment"]["item"]["external_id"] == "row-2"
    assert payload["skip_reason"] == "source text is unreadable"
    skipped_assignment = db_session.get(Assignment, assignment["id"])
    assert skipped_assignment.status == "skipped"
    assert skipped_assignment.item.status == "skipped"
    assert skipped_assignment.submission.status == SubmissionStatus.DRAFT
    assert skipped_assignment.submission.answer_payload == {"sentiment": "positive"}
    assert skipped_assignment.submission.submitted_at is None
    assert db_session.scalar(select(SubmissionAttempt).where(SubmissionAttempt.submission_id == skipped_assignment.submission.id)) is None
    audit = db_session.scalar(
        select(AuditLog).where(
            AuditLog.entity_type == "assignment",
            AuditLog.entity_id == assignment["id"],
            AuditLog.action == "skip",
        )
    )
    assert audit is not None
    assert audit.reason == "source text is unreadable"
    assert audit.from_status == "active"
    assert audit.to_status == "skipped"
    assert audit.details["submission_id"] == skipped_assignment.submission.id
    assert audit.details["next_assignment_id"] == payload["assignment"]["id"]


def test_skipped_assignment_cannot_be_edited_or_submitted(
    client: TestClient, db_session: Session
) -> None:
    task_id = _create_navigation_task(db_session, item_count=2)
    assignment = _claim_assignment(client, task_id)
    skip_response = client.post(
        f"/labeler/assignments/{assignment['id']}/skip",
        headers=auth_headers(UserRole.LABELER),
        json={"reason": "skip before answering"},
    )
    assert skip_response.status_code == 200

    draft_response = client.put(
        f"/labeler/assignments/{assignment['id']}/draft",
        headers=auth_headers(UserRole.LABELER),
        json={"answer_payload": {"sentiment": "positive"}},
    )
    submit_response = client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=auth_headers(UserRole.LABELER),
        json={"answer_payload": {"sentiment": "positive"}},
    )

    assert draft_response.status_code == 400
    assert draft_response.json()["detail"]["code"] == "INVALID_TRANSITION"
    assert submit_response.status_code == 400
    assert submit_response.json()["detail"]["code"] == "INVALID_TRANSITION"
    skipped_assignment = db_session.get(Assignment, assignment["id"])
    assert skipped_assignment.status == "skipped"
    assert skipped_assignment.submission.status == SubmissionStatus.DRAFT
    assert skipped_assignment.submission.answer_payload == {}
    assert skipped_assignment.submission.submitted_at is None
    assert db_session.scalar(
        select(SubmissionAttempt).where(SubmissionAttempt.submission_id == skipped_assignment.submission.id)
    ) is None


def test_navigation_never_targets_another_labelers_assignment(
    client: TestClient, db_session: Session
) -> None:
    task_id = _create_navigation_task(db_session, item_count=3)
    first = _claim_assignment(client, task_id)
    other_assignment = _claim_assignment(client, task_id, user_id="other-labeler")

    next_response = client.post(
        f"/labeler/assignments/{first['id']}/next",
        headers=auth_headers(UserRole.LABELER),
    )

    assert next_response.status_code == 200
    payload = next_response.json()
    assert payload["assignment"]["labeler_id"] == "test-labeler"
    assert payload["assignment"]["id"] != other_assignment["id"]
    assert payload["assignment"]["item"]["external_id"] == "row-3"


def test_navigation_denies_cross_labeler_access(client: TestClient, db_session: Session) -> None:
    task_id = _create_navigation_task(db_session, item_count=2)
    assignment = _claim_assignment(client, task_id)

    state_response = client.get(
        f"/labeler/assignments/{assignment['id']}/navigation",
        headers=auth_headers(UserRole.LABELER, user_id="other-labeler"),
    )
    skip_response = client.post(
        f"/labeler/assignments/{assignment['id']}/skip",
        headers=auth_headers(UserRole.LABELER, user_id="other-labeler"),
        json={"reason": "not mine"},
    )

    assert state_response.status_code == 403
    assert state_response.json()["detail"]["code"] == "PERMISSION_DENIED"
    assert skip_response.status_code == 403
    assert skip_response.json()["detail"]["code"] == "PERMISSION_DENIED"


def _create_navigation_task(db_session: Session, *, item_count: int) -> str:
    task = Task(
        name="Navigation task",
        description="Navigate through this queue",
        status=TaskStatus.PUBLISHED,
        created_by="test-owner",
    )
    db_session.add(task)
    db_session.flush()
    base_time = datetime(2026, 5, 31, tzinfo=UTC)
    for index in range(item_count):
        db_session.add(
            TaskItem(
                task_id=task.id,
                external_id=f"row-{index + 1}",
                payload={"text": f"Text {index + 1}"},
                created_at=base_time + timedelta(seconds=index),
            )
        )
    db_session.add(
        TemplateSchema(
            task_id=task.id,
            version=1,
            title="Navigation schema",
            schema_payload={
                "version": 1,
                "title": "Navigation schema",
                "layout": {"type": "single", "groups": []},
                "fields": [
                    {"id": "source", "type": "show_item", "label": "Source", "source": "item.payload.text"},
                    {
                        "id": "sentiment",
                        "type": "radio",
                        "label": "Sentiment",
                        "required": True,
                        "options": [
                            {"label": "Positive", "value": "positive"},
                            {"label": "Negative", "value": "negative"},
                        ],
                    },
                ],
                "llmTools": [],
                "validations": [],
                "visibilityRules": [],
            },
            is_published=True,
            created_by="test-owner",
            published_at=base_time,
        )
    )
    db_session.commit()
    return task.id


def _claim_assignment(
    client: TestClient,
    task_id: str,
    *,
    user_id: str = "test-labeler",
) -> dict:
    response = client.post(
        f"/labeler/tasks/{task_id}/claim",
        headers=auth_headers(UserRole.LABELER, user_id=user_id),
    )
    assert response.status_code == 201
    return response.json()
