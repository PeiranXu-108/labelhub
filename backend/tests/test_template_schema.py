from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import UserRole
from app.models import TemplateSchema
from tests.conftest import auth_headers


def _schema_payload(*, title: str = "Quality template", required: bool = True) -> dict:
    return {
        "version": 1,
        "title": title,
        "layout": {"type": "single", "groups": []},
        "fields": [
            {
                "id": "raw_text",
                "type": "show_item",
                "label": "Raw text",
                "source": "item.payload.text",
            },
            {
                "id": "sentiment",
                "type": "radio",
                "label": "Sentiment",
                "required": required,
                "options": [
                    {"label": "Positive", "value": "positive"},
                    {"label": "Negative", "value": "negative"},
                ],
            },
        ],
        "llmTools": [],
        "validations": [],
        "visibilityRules": [],
    }


def _create_task(client: TestClient, owner_headers: dict[str, str], name: str = "Template task") -> dict:
    return client.post("/tasks", headers=owner_headers, json={"name": name}).json()


def test_duplicate_field_ids_are_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = _create_task(client, owner_headers)
    payload = _schema_payload()
    payload["fields"][1]["id"] = "raw_text"

    response = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": payload},
    )

    assert response.status_code == 422
    assert "Field ids must be unique" in response.text


def test_radio_without_options_is_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = _create_task(client, owner_headers)
    payload = _schema_payload()
    payload["fields"][1]["options"] = []

    response = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": payload},
    )

    assert response.status_code == 422
    assert "at least 1 item" in response.text


def test_publish_creates_immutable_versions(
    client: TestClient, db_session: Session
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = _create_task(client, owner_headers)

    first_draft = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _schema_payload(title="Version one")},
    )
    first_publish = client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    second_draft = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _schema_payload(title="Version two")},
    )
    second_publish = client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)

    assert first_draft.status_code == 201
    assert first_publish.status_code == 200
    assert first_publish.json()["version"] == 1
    assert first_publish.json()["is_published"] is True
    assert second_draft.status_code == 201
    assert second_draft.json()["version"] == 2
    assert second_draft.json()["is_published"] is False
    assert second_publish.status_code == 200
    assert second_publish.json()["version"] == 2

    published = (
        db_session.query(TemplateSchema)
        .filter_by(task_id=task["id"], is_published=True)
        .order_by(TemplateSchema.version)
        .all()
    )
    assert [schema.version for schema in published] == [1, 2]
    assert published[0].schema_payload["title"] == "Version one"
    assert published[1].schema_payload["title"] == "Version two"


def test_required_field_missing_in_submission_is_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    labeler_headers = auth_headers(UserRole.LABELER)
    task = _create_task(client, owner_headers, name="Submission validation")
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "hello"}}]},
    )
    client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _schema_payload(required=True)},
    )
    client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    assignment = client.post(f"/labeler/tasks/{task['id']}/claim", headers=labeler_headers).json()

    response = client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=labeler_headers,
        json={"answer_payload": {}},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "INVALID_SUBMISSION_PAYLOAD"
    assert "sentiment" in response.json()["detail"]["message"]


def test_template_draft_openapi_uses_schema_request_key(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()
    request_schema = openapi["paths"]["/tasks/{task_id}/template/draft"]["post"]["requestBody"][
        "content"
    ]["application/json"]["schema"]
    component_name = request_schema["$ref"].rsplit("/", 1)[-1]
    properties = openapi["components"]["schemas"][component_name]["properties"]

    assert "schema" in properties
    assert "template_schema" not in properties
