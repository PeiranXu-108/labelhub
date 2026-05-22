from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import UserRole
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
