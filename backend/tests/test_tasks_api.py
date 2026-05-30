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


def test_invalid_task_transition_is_rejected(client: TestClient, db_session: Session) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Publish once"},
    )
    task = created.json()
    task_id = task["id"]
    client.post(
        f"/tasks/{task_id}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )
    db_session.add(
        TemplateSchema(
            task_id=task_id,
            version=1,
            title="Ready schema",
            schema_payload={"version": 1, "fields": []},
            is_published=True,
            created_by=task["created_by"],
        )
    )
    db_session.commit()

    first_publish = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)
    second_publish = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert first_publish.status_code == 200
    assert first_publish.json()["status"] == TaskStatus.PUBLISHED.value
    assert second_publish.status_code == 400
    assert second_publish.json()["detail"]["code"] == "INVALID_TASK_TRANSITION"


def test_publish_requires_imported_items(
    client: TestClient, db_session: Session
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "No items"},
    )
    task_id = created.json()["id"]
    db_session.add(
        TemplateSchema(
            task_id=task_id,
            version=1,
            title="Ready schema",
            schema_payload={"version": 1, "fields": []},
            is_published=True,
            created_by=created.json()["created_by"],
        )
    )
    db_session.commit()

    response = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "TASK_ITEMS_REQUIRED"
    assert db_session.get(Task, task_id).status == TaskStatus.DRAFT


def test_publish_requires_published_template(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "No published template"},
    )
    task_id = created.json()["id"]
    client.post(
        f"/tasks/{task_id}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )

    response = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "TEMPLATE_REQUIRED"


def test_task_created_by_is_not_nullable() -> None:
    assert Task.__table__.c.created_by.nullable is False
