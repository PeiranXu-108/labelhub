from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import TaskStatus, UserRole
from app.models import Task, TemplateSchema
from tests.conftest import auth_headers


def test_reviewer_cannot_create_tasks(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.REVIEWER),
        json={"name": "Blocked task"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PERMISSION_DENIED"


def test_invalid_task_transition_is_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Publish once"},
    )
    task_id = created.json()["id"]

    first_publish = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)
    second_publish = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert first_publish.status_code == 200
    assert first_publish.json()["status"] == TaskStatus.PUBLISHED.value
    assert second_publish.status_code == 400
    assert second_publish.json()["detail"]["code"] == "INVALID_TASK_TRANSITION"


def test_publish_does_not_create_implicit_template_schema(
    client: TestClient, db_session: Session
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "No implicit template"},
    )
    task_id = created.json()["id"]

    response = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert response.status_code == 200
    assert db_session.query(TemplateSchema).filter_by(task_id=task_id).count() == 0


def test_task_created_by_is_not_nullable() -> None:
    assert Task.__table__.c.created_by.nullable is False
