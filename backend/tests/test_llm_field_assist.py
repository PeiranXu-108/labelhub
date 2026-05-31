from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.agent.config import LLMProviderConfig
from app.domain.enums import SubmissionStatus, TaskStatus, UserRole
from app.main import app
from app.models import Assignment, AuditLog, Submission, Task, TaskItem, TemplateSchema
from tests.conftest import auth_headers


class QueueAssistModel:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.calls = 0
        self.prompts: list[str] = []

    def invoke(self, prompt: str) -> object:
        self.prompts.append(prompt)
        response = self.responses[self.calls]
        self.calls += 1
        if isinstance(response, Exception):
            raise response
        return response


def _override_assist_dependencies(
    *,
    model: QueueAssistModel | None = None,
    provider_config: LLMProviderConfig | None = None,
) -> None:
    import app.api.routes.labeler as labeler_routes

    if hasattr(labeler_routes, "get_llm_field_assist_model"):
        app.dependency_overrides[labeler_routes.get_llm_field_assist_model] = lambda: model
    if hasattr(labeler_routes, "get_llm_field_assist_provider_config"):
        app.dependency_overrides[labeler_routes.get_llm_field_assist_provider_config] = lambda: provider_config


def _create_assignment(
    db: Session,
    *,
    mode: str = "suggest",
    output_schema: dict[str, Any] | None = None,
) -> Assignment:
    task = Task(
        name="Field assist task",
        description="Assist labelers with summaries",
        status=TaskStatus.PUBLISHED,
        created_by="test-owner",
    )
    item = TaskItem(task=task, external_id="row-1", payload={"text": "Customer asks for refund status."})
    trigger: dict[str, Any] = {
        "id": "assist_summary",
        "type": "llm_trigger",
        "label": "Suggest summary",
        "promptTemplate": "Summarize {{item.payload.text}} using sentiment {{answers.sentiment}}.",
        "targetFieldId": "summary",
        "mode": mode,
        "contextFields": ["sentiment"],
    }
    if output_schema is not None:
        trigger["outputSchema"] = output_schema
    schema = TemplateSchema(
        task=task,
        version=1,
        title="Assist schema",
        schema_payload={
            "version": 1,
            "title": "Assist schema",
            "layout": {"type": "single", "groups": []},
            "fields": [
                {"id": "raw_text", "type": "show_item", "label": "Raw text", "source": "item.payload.text"},
                {
                    "id": "sentiment",
                    "type": "radio",
                    "label": "Sentiment",
                    "options": [
                        {"label": "Positive", "value": "positive"},
                        {"label": "Negative", "value": "negative"},
                    ],
                },
                {"id": "summary", "type": "textarea", "label": "Summary", "maxLength": 120},
                trigger,
            ],
            "llmTools": [],
            "validations": [],
            "visibilityRules": [],
        },
        is_published=True,
        created_by="test-owner",
    )
    assignment = Assignment(task=task, item=item, labeler_id="test-labeler", status="active")
    submission = Submission(
        task=task,
        item=item,
        assignment=assignment,
        labeler_id="test-labeler",
        template_schema=schema,
        schema_version=1,
        answer_payload={},
        status=SubmissionStatus.DRAFT,
    )
    db.add_all([task, item, schema, assignment, submission])
    db.commit()
    db.refresh(assignment)
    return assignment


def test_valid_trigger_call_returns_structured_suggestion_and_logs(
    client: TestClient,
    db_session: Session,
) -> None:
    assignment = _create_assignment(db_session, output_schema={"preset": "text"})
    model = QueueAssistModel(
        [{"value": "Customer wants a refund update.", "rationale": "Condenses the ticket.", "confidence": 0.91}]
    )
    _override_assist_dependencies(model=model)

    response = client.post(
        f"/labeler/assignments/{assignment.id}/llm-assist",
        headers=auth_headers(UserRole.LABELER),
        json={"trigger_field_id": "assist_summary", "answer_payload": {"sentiment": "positive"}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["trigger_field_id"] == "assist_summary"
    assert payload["target_field_id"] == "summary"
    assert payload["mode"] == "suggest"
    assert payload["value"] == "Customer wants a refund update."
    assert payload["rationale"] == "Condenses the ticket."
    assert payload["status"] == "succeeded"
    assert "Customer asks for refund status." in model.prompts[0]
    assert '"sentiment": "positive"' in model.prompts[0]

    from app.models import LLMFieldAssistLog

    log = db_session.query(LLMFieldAssistLog).one()
    assert log.status == "succeeded"
    assert log.assignment_id == assignment.id
    assert log.trigger_field_id == "assist_summary"
    assert log.target_field_id == "summary"
    assert log.structured_response["value"] == "Customer wants a refund update."
    audit = db_session.query(AuditLog).filter_by(entity_type="submission", action="llm_field_assist").one()
    assert audit.details["assist_log_id"] == log.id
    assert audit.details["status"] == "succeeded"


def test_missing_provider_credentials_returns_controlled_error_and_failed_log(
    client: TestClient,
    db_session: Session,
) -> None:
    assignment = _create_assignment(db_session)
    _override_assist_dependencies(
        provider_config=LLMProviderConfig(
            provider="deepseek",
            model="deepseek-chat",
            base_url="https://api.deepseek.com",
            api_key=None,
            temperature=0,
        )
    )

    response = client.post(
        f"/labeler/assignments/{assignment.id}/llm-assist",
        headers=auth_headers(UserRole.LABELER),
        json={"trigger_field_id": "assist_summary", "answer_payload": {"sentiment": "positive"}},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "LLM_PROVIDER_UNAVAILABLE"
    assert "provider credentials" in response.json()["detail"]["message"]

    from app.models import LLMFieldAssistLog

    log = db_session.query(LLMFieldAssistLog).one()
    assert log.status == "failed"
    assert "Missing LABELHUB_LLM_API_KEY" in log.failure_reason


def test_malformed_model_output_is_rejected_and_logged(
    client: TestClient,
    db_session: Session,
) -> None:
    assignment = _create_assignment(db_session)
    _override_assist_dependencies(model=QueueAssistModel([{"summary": "not the structured envelope"}]))

    response = client.post(
        f"/labeler/assignments/{assignment.id}/llm-assist",
        headers=auth_headers(UserRole.LABELER),
        json={"trigger_field_id": "assist_summary", "answer_payload": {"sentiment": "positive"}},
    )

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "LLM_FIELD_OUTPUT_INVALID"

    from app.models import LLMFieldAssistLog

    log = db_session.query(LLMFieldAssistLog).one()
    assert log.status == "failed"
    assert "value" in log.failure_reason


def test_labeler_cannot_invoke_assist_for_another_labelers_assignment(
    client: TestClient,
    db_session: Session,
) -> None:
    assignment = _create_assignment(db_session)
    model = QueueAssistModel([{"value": "Should not be called."}])
    _override_assist_dependencies(model=model)

    response = client.post(
        f"/labeler/assignments/{assignment.id}/llm-assist",
        headers=auth_headers(UserRole.LABELER, user_id="other-labeler"),
        json={"trigger_field_id": "assist_summary", "answer_payload": {}},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PERMISSION_DENIED"
    assert model.calls == 0


def test_target_field_validation_rejects_invalid_structured_value(
    client: TestClient,
    db_session: Session,
) -> None:
    assignment = _create_assignment(db_session, output_schema={"jsonSchema": {"type": "string", "maxLength": 10}})
    _override_assist_dependencies(model=QueueAssistModel([{"value": "This summary is much too long."}]))

    response = client.post(
        f"/labeler/assignments/{assignment.id}/llm-assist",
        headers=auth_headers(UserRole.LABELER),
        json={"trigger_field_id": "assist_summary", "answer_payload": {"sentiment": "positive"}},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "LLM_FIELD_VALUE_INVALID"

    from app.models import LLMFieldAssistLog

    log = db_session.query(LLMFieldAssistLog).one()
    assert log.status == "failed"
    assert "at most 10 characters" in log.failure_reason
