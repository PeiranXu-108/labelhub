from fastapi.testclient import TestClient

from app.domain.enums import UserRole
from tests.conftest import auth_headers


def _template_payload() -> dict:
    return {
        "version": 1,
        "title": "Review test schema",
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
                "required": True,
                "options": [
                    {"label": "Positive", "value": "positive"},
                    {"label": "Neutral", "value": "neutral"},
                    {"label": "Negative", "value": "negative"},
                ],
            },
        ],
        "llmTools": [],
        "validations": [],
        "visibilityRules": [],
    }


def _submitted_assignment(client: TestClient) -> dict:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Reviewable"}).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "needs review"}}]},
    )
    client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _template_payload()},
    )
    client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    assignment = client.post(
        f"/labeler/tasks/{task['id']}/claim",
        headers=auth_headers(UserRole.LABELER),
    ).json()
    client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=auth_headers(UserRole.LABELER, user_id=assignment["labeler_id"]),
        json={"answer_payload": {"sentiment": "neutral"}},
    )
    return assignment


def test_labeler_cannot_approve_submissions(client: TestClient) -> None:
    assignment = _submitted_assignment(client)

    response = client.post(
        f"/review/submissions/{assignment['submission']['id']}/approve",
        headers=auth_headers(UserRole.LABELER, user_id=assignment["labeler_id"]),
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PERMISSION_DENIED"


def test_return_action_requires_reason(client: TestClient) -> None:
    assignment = _submitted_assignment(client)

    response = client.post(
        f"/review/submissions/{assignment['submission']['id']}/return",
        headers=auth_headers(UserRole.REVIEWER),
        json={"reason": ""},
    )

    assert response.status_code == 422
