from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import TaskStatus, UserRole
from app.models import AuditLog, Task, TemplateSchema
from tests.conftest import auth_headers


def test_create_task_persists_metadata_with_normalized_tags_and_plain_text(
    client: TestClient,
) -> None:
    payload = {
        "name": "Rewarded Support QA",
        "description": "Expanded metadata task",
        "instruction_rich_text": {
            "format": "markdown",
            "content": "## Read first\nAccept **accurate** answers only.",
        },
        "instruction_plain_text": "frontend supplied stale copy",
        "tags": [" Support QA ", "EN-US"],
        "reward_rule": {
            "mode": "fixed_per_accepted_submission",
            "currency": "usd",
            "amount": "1.25",
            "description": "Paid after accepted submissions.",
        },
        "quality_rules": [
            {
                "label": "Evidence",
                "description": "Answers must cite the support conversation.",
            }
        ],
    }

    response = client.post("/tasks", headers=auth_headers(UserRole.OWNER), json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["instruction_rich_text"] == {
        "format": "markdown",
        "content": "## Read first\nAccept **accurate** answers only.",
    }
    assert body["instruction_plain_text"] == "Read first Accept accurate answers only."
    assert body["tags"] == ["support qa", "en-us"]
    assert body["reward_rule"] == {
        "mode": "fixed_per_accepted_submission",
        "currency": "USD",
        "amount": "1.25",
        "description": "Paid after accepted submissions.",
    }
    assert body["quality_rules"] == [
        {
            "label": "Evidence",
            "description": "Answers must cite the support conversation.",
        }
    ]


def test_update_task_metadata_keeps_workflow_status_unchanged(
    client: TestClient,
    db_session: Session,
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Draft metadata"}).json()

    response = client.patch(
        f"/tasks/{task['id']}",
        headers=owner_headers,
        json={
            "instruction_rich_text": {
                "format": "markdown",
                "content": "Use the current rubric.",
            },
            "tags": ["Rubric"],
            "reward_rule": {"mode": "manual", "currency": "eur", "description": "Settled outside LabelHub."},
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == TaskStatus.DRAFT.value
    db_session.refresh(db_session.get(Task, task["id"]))
    assert db_session.get(Task, task["id"]).status == TaskStatus.DRAFT
    update_audit = db_session.scalar(
        select(AuditLog)
        .where(AuditLog.entity_type == "task", AuditLog.entity_id == task["id"], AuditLog.action == "update")
        .order_by(AuditLog.created_at.desc())
    )
    assert update_audit is not None
    assert update_audit.from_status is None
    assert update_audit.to_status is None


def test_duplicate_tags_after_normalization_are_rejected(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={"name": "Duplicate tags", "tags": ["QA", " qa "]},
    )

    assert response.status_code == 422


def test_negative_reward_amount_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={
            "name": "Negative reward",
            "reward_rule": {
                "mode": "fixed_per_accepted_submission",
                "currency": "USD",
                "amount": "-0.01",
            },
        },
    )

    assert response.status_code == 422


def test_reward_currency_and_amount_match_reward_mode(client: TestClient) -> None:
    currency_without_reward = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={"name": "Currency only", "reward_rule": {"mode": "none", "currency": "USD"}},
    )
    manual_amount = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={
            "name": "Manual amount",
            "reward_rule": {"mode": "manual", "currency": "USD", "amount": "1.00"},
        },
    )

    assert currency_without_reward.status_code == 422
    assert manual_amount.status_code == 422


def test_unsafe_rich_text_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={
            "name": "Unsafe instructions",
            "instruction_rich_text": {"format": "markdown", "content": "<script>alert(1)</script>"},
        },
    )

    assert response.status_code == 422


def test_create_rejects_non_string_description(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={"name": "Bad description", "description": {"bad": "type"}},
    )

    assert response.status_code == 422


def test_update_rejects_non_string_description(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Update text"}).json()

    response = client.patch(
        f"/tasks/{task['id']}",
        headers=owner_headers,
        json={"description": ["not", "text"]},
    )

    assert response.status_code == 422


def test_create_rejects_non_string_instruction_plain_text(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={"name": "Bad instruction", "instruction_plain_text": ["not", "text"]},
    )

    assert response.status_code == 422


def test_update_rejects_non_string_instruction_plain_text(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Update instruction"}).json()

    response = client.patch(
        f"/tasks/{task['id']}",
        headers=owner_headers,
        json={"instruction_plain_text": {"bad": "type"}},
    )

    assert response.status_code == 422


def test_reward_description_rejects_non_string_value(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={
            "name": "Bad reward description",
            "reward_rule": {
                "mode": "manual",
                "currency": "usd",
                "description": {"bad": "type"},
            },
        },
    )

    assert response.status_code == 422


def test_blank_text_fields_still_normalize_to_null(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={
            "name": "Blank text",
            "description": "   ",
            "instruction_plain_text": "\n\t",
            "reward_rule": {"mode": "manual", "currency": "usd", "description": "   "},
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["description"] is None
    assert body["instruction_plain_text"] is None
    assert body["reward_rule"]["description"] is None


def test_labeler_task_surfaces_include_metadata(
    client: TestClient,
    db_session: Session,
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post(
        "/tasks",
        headers=owner_headers,
        json={
            "name": "Published metadata",
            "instruction_rich_text": {"format": "markdown", "content": "Follow the policy."},
            "tags": ["Policy"],
            "reward_rule": {"mode": "manual", "currency": "USD", "description": "Tracked outside LabelHub."},
        },
    ).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )
    db_session.add(
        TemplateSchema(
            task_id=task["id"],
            version=1,
            title="Ready schema",
            schema_payload={"version": 1, "fields": []},
            is_published=True,
            created_by=task["created_by"],
        )
    )
    db_session.commit()
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)

    marketplace = client.get("/labeler/tasks", headers=auth_headers(UserRole.LABELER))
    claim = client.post(f"/labeler/tasks/{task['id']}/claim", headers=auth_headers(UserRole.LABELER))
    assignment = client.get(
        f"/labeler/assignments/{claim.json()['id']}",
        headers=auth_headers(UserRole.LABELER),
    )

    assert marketplace.status_code == 200
    assert marketplace.json()[0]["instruction_plain_text"] == "Follow the policy."
    assert marketplace.json()[0]["tags"] == ["policy"]
    assert marketplace.json()[0]["reward_rule"]["mode"] == "manual"
    assert assignment.status_code == 200
    assert assignment.json()["task"]["instruction_plain_text"] == "Follow the policy."
    assert assignment.json()["task"]["tags"] == ["policy"]
