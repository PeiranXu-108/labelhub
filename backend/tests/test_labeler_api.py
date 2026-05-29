from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.domain.enums import UserRole
import app.services.submissions as submissions_module
from app.models import TemplateSchema
from tests.conftest import auth_headers


def test_claiming_item_requires_published_task(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    labeler_headers = auth_headers(UserRole.LABELER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Draft task"}).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "draft"}}]},
    )

    response = client.post(f"/labeler/tasks/{task['id']}/claim", headers=labeler_headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "TASK_NOT_PUBLISHED"


def test_claiming_item_requires_published_template(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Needs template"},
    ).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)

    response = client.post(
        f"/labeler/tasks/{task['id']}/claim",
        headers=auth_headers(UserRole.LABELER),
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "TEMPLATE_REQUIRED"


def test_claiming_item_respects_assignment_ownership(
    client: TestClient, db_session: Session
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Claimable"}).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    db_session.add(
        TemplateSchema(
            task_id=task["id"],
            version=1,
            title="Test schema",
            schema_payload={"version": 1, "fields": []},
            is_published=True,
            created_by=task["created_by"],
        )
    )
    db_session.commit()

    first = client.post(
        f"/labeler/tasks/{task['id']}/claim",
        headers=auth_headers(UserRole.LABELER),
    )
    second = client.post(
        f"/labeler/tasks/{task['id']}/claim",
        headers=auth_headers(UserRole.LABELER),
    )

    assert first.status_code == 201
    assert first.json()["item"]["external_id"] == "row-1"
    assert second.status_code == 404
    assert second.json()["detail"]["code"] == "NO_AVAILABLE_ITEMS"


def test_submit_assignment_enqueues_ai_review_after_commit(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    assignment_id = _claim_ready_assignment(client, db_session)
    enqueued: list[str] = []

    def fake_enqueue(submission_id: str) -> None:
        enqueued.append(submission_id)

    monkeypatch.setattr(submissions_module, "enqueue_ai_review", fake_enqueue, raising=False)

    response = client.post(
        f"/labeler/assignments/{assignment_id}/submit",
        headers=auth_headers(UserRole.LABELER),
        json={"answer_payload": {"sentiment": "positive"}},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "submitted"
    assert enqueued == [response.json()["id"]]


def test_submit_assignment_succeeds_when_ai_review_enqueue_fails(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    assignment_id = _claim_ready_assignment(client, db_session, task_name="Enqueue failure")

    def fail_enqueue(_submission_id: str) -> None:
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(submissions_module, "enqueue_ai_review", fail_enqueue, raising=False)

    response = client.post(
        f"/labeler/assignments/{assignment_id}/submit",
        headers=auth_headers(UserRole.LABELER),
        json={"answer_payload": {"sentiment": "positive"}},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "submitted"


def _claim_ready_assignment(
    client: TestClient,
    db_session: Session,
    *,
    task_name: str = "Agent workflow task",
) -> str:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post("/tasks", headers=owner_headers, json={"name": task_name}).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": f"{task['id']}-row-1", "payload": {"text": "Great support"}}]},
    )
    db_session.add(
        TemplateSchema(
            task_id=task["id"],
            version=1,
            title="Sentiment schema",
            schema_payload={
                "version": 1,
                "title": "Sentiment schema",
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
            created_by=task["created_by"],
        )
    )
    db_session.commit()
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    claim = client.post(
        f"/labeler/tasks/{task['id']}/claim",
        headers=auth_headers(UserRole.LABELER),
    )
    assert claim.status_code == 201
    return claim.json()["id"]
