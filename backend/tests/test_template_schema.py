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


def _rich_media_schema_payload() -> dict:
    return {
        "version": 1,
        "title": "Rich media template",
        "layout": {"type": "single", "groups": []},
        "fields": [
            {
                "id": "raw_text",
                "type": "show_item",
                "label": "Raw text",
                "source": "item.payload.text",
            },
            {
                "id": "rationale",
                "type": "rich_text",
                "label": "Rationale",
                "required": True,
                "helpText": "Use safe markdown only.",
                "placeholder": "Write the evidence and rationale.",
                "minLength": 3,
                "maxLength": 500,
            },
            {
                "id": "screenshots",
                "type": "image_upload",
                "label": "Screenshots",
                "required": True,
                "acceptedMimeTypes": ["image/png", "image/jpeg"],
                "maxFileSizeBytes": 1_048_576,
                "maxCount": 2,
            },
            {
                "id": "attachments",
                "type": "file_upload",
                "label": "Attachments",
                "required": True,
                "acceptedMimeTypes": ["application/pdf", "text/plain"],
                "acceptedExtensions": [".pdf", ".txt"],
                "maxFileSizeBytes": 2_097_152,
                "maxCount": 3,
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


def test_full_mvp_designer_schema_is_accepted_by_backend_validation(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = _create_task(client, owner_headers)
    payload = {
        "version": 1,
        "title": "Full designer schema",
        "layout": {"type": "single", "groups": []},
        "fields": [
            {
                "id": "source",
                "type": "show_item",
                "label": "Source",
                "source": "item.payload.text",
            },
            {
                "id": "short_answer",
                "type": "text",
                "label": "Short answer",
                "required": True,
                "helpText": "Keep it concise.",
                "placeholder": "One-line answer",
                "minLength": 1,
                "maxLength": 120,
            },
            {
                "id": "notes",
                "type": "textarea",
                "label": "Notes",
                "placeholder": "Explain the decision",
            },
            {
                "id": "score",
                "type": "number",
                "label": "Score",
                "min": 0,
                "max": 100,
            },
            {
                "id": "sentiment",
                "type": "radio",
                "label": "Sentiment",
                "options": [
                    {"label": "Positive", "value": "positive"},
                    {"label": "Negative", "value": "negative"},
                ],
            },
            {
                "id": "issues",
                "type": "checkbox_group",
                "label": "Issues",
                "options": [
                    {"label": "Tone", "value": "tone"},
                    {"label": "Accuracy", "value": "accuracy"},
                ],
            },
            {
                "id": "priority",
                "type": "select",
                "label": "Priority",
                "options": [
                    {"label": "High", "value": "high"},
                    {"label": "Low", "value": "low"},
                ],
            },
            {"id": "quality", "type": "rating", "label": "Quality", "min": 1, "max": 5},
            {"id": "metadata", "type": "json", "label": "Metadata"},
            {
                "id": "assist",
                "type": "llm_trigger",
                "label": "Assist",
                "promptTemplate": "Summarize {{item.payload.text}}",
                "targetFieldId": "notes",
            },
        ],
        "llmTools": [],
        "validations": [],
        "visibilityRules": [],
    }

    response = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": payload},
    )

    assert response.status_code == 201
    response_fields = response.json()["schema_payload"]["fields"]
    assert [field["type"] for field in response_fields] == [field["type"] for field in payload["fields"]]
    assert response_fields[1]["id"] == "short_answer"
    assert response_fields[1]["minLength"] == 1
    assert response_fields[4]["options"] == payload["fields"][4]["options"]
    assert response_fields[9]["promptTemplate"] == "Summarize {{item.payload.text}}"
    assert response_fields[9]["targetFieldId"] == "notes"


def test_rich_text_and_media_field_schema_is_accepted(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = _create_task(client, owner_headers, name="Rich media schema")
    payload = _rich_media_schema_payload()

    response = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": payload},
    )

    assert response.status_code == 201
    response_fields = response.json()["schema_payload"]["fields"]
    assert [field["type"] for field in response_fields] == [
        "show_item",
        "rich_text",
        "image_upload",
        "file_upload",
    ]
    assert response_fields[1]["plainTextFallback"] is True
    assert response_fields[2]["acceptedMimeTypes"] == ["image/png", "image/jpeg"]
    assert response_fields[2]["maxFileSizeBytes"] == 1_048_576
    assert response_fields[2]["maxCount"] == 2
    assert response_fields[3]["acceptedExtensions"] == [".pdf", ".txt"]


def test_rich_media_field_constraints_are_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = _create_task(client, owner_headers, name="Invalid rich media schema")
    payload = _rich_media_schema_payload()
    payload["fields"][2]["acceptedMimeTypes"] = ["text/html"]

    response = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": payload},
    )

    assert response.status_code == 422
    assert "image_upload acceptedMimeTypes must be image MIME types" in response.text

    payload = _rich_media_schema_payload()
    payload["fields"][2]["maxFileSizeBytes"] = 0
    payload["fields"][2]["maxCount"] = 0
    payload["fields"][3]["acceptedExtensions"] = ["pdf"]
    response = client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": payload},
    )

    assert response.status_code == 422
    assert "greater than or equal to 1" in response.text
    assert "acceptedExtensions entries must start with a dot" in response.text


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


def test_required_rich_text_and_upload_fields_missing_in_submission_are_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    labeler_headers = auth_headers(UserRole.LABELER)
    task = _create_task(client, owner_headers, name="Required rich media submission")
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "hello"}}]},
    )
    client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _rich_media_schema_payload()},
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
    assert "rationale" in response.json()["detail"]["message"]
    assert "screenshots" in response.json()["detail"]["message"]
    assert "attachments" in response.json()["detail"]["message"]


def test_unsafe_rich_text_submission_is_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    labeler_headers = auth_headers(UserRole.LABELER)
    task = _create_task(client, owner_headers, name="Unsafe rich text submission")
    payload = _rich_media_schema_payload()
    payload["fields"] = payload["fields"][:2]
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "hello"}}]},
    )
    client.post(f"/tasks/{task['id']}/template/draft", headers=owner_headers, json={"schema": payload})
    client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    assignment = client.post(f"/labeler/tasks/{task['id']}/claim", headers=labeler_headers).json()

    response = client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=labeler_headers,
        json={
            "answer_payload": {
                "rationale": {
                    "format": "markdown",
                    "content": "<script>alert(1)</script>",
                    "plainText": "alert(1)",
                }
            }
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "INVALID_SUBMISSION_PAYLOAD"
    assert "unsafe markup" in response.json()["detail"]["message"]


def test_template_draft_openapi_uses_schema_request_key(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()
    request_schema = openapi["paths"]["/tasks/{task_id}/template/draft"]["post"]["requestBody"][
        "content"
    ]["application/json"]["schema"]
    component_name = request_schema["$ref"].rsplit("/", 1)[-1]
    properties = openapi["components"]["schemas"][component_name]["properties"]

    assert "schema" in properties
    assert "template_schema" not in properties
