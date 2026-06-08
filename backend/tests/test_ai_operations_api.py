from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.config import LLMProviderConfig
from app.domain.enums import AIReviewDecision, SubmissionAction, SubmissionStatus, TaskStatus, UserRole
from app.models import AIReview, AuditLog, ReviewConfig, Submission, Task, TaskItem, TemplateSchema
from app.services.workflow import ActorContext, WorkflowService
from tests.conftest import auth_headers


def test_ai_operations_queue_filters_and_permissions(
    client: TestClient, db_session: Session
) -> None:
    passed = _submission_with_review(db_session, "passed", AIReviewDecision.PASS, SubmissionStatus.AI_PASSED)
    failed = _submission_with_review(
        db_session,
        "failed",
        AIReviewDecision.HUMAN_REVIEW,
        SubmissionStatus.NEEDS_HUMAN_REVIEW,
        review_status="failed",
    )
    _submission_without_review(db_session, "pending", SubmissionStatus.SUBMITTED)

    owner_response = client.get(
        "/ai-operations/runs?run_status=failed",
        headers=auth_headers(UserRole.OWNER),
    )

    assert owner_response.status_code == 200
    payload = owner_response.json()
    assert [item["submission_id"] for item in payload] == [failed.id]
    assert payload[0]["run_status"] == "failed"
    assert payload[0]["idempotency_key"] == f"{failed.id}:1"
    assert payload[0]["retry_count"] == 2
    assert payload[0]["operator_retry_count"] == 0

    reviewer_response = client.get(
        "/ai-operations/runs?run_status=passed",
        headers=auth_headers(UserRole.REVIEWER),
    )

    assert reviewer_response.status_code == 200
    assert [item["submission_id"] for item in reviewer_response.json()] == [passed.id]

    labeler_response = client.get(
        "/ai-operations/runs",
        headers=auth_headers(UserRole.LABELER),
    )

    assert labeler_response.status_code == 403


def test_ai_operations_detail_includes_audit_safe_prompt_response_and_config(
    client: TestClient, db_session: Session
) -> None:
    submission = _submission_with_review(
        db_session,
        "detail",
        AIReviewDecision.HUMAN_REVIEW,
        SubmissionStatus.NEEDS_HUMAN_REVIEW,
        review_status="failed",
    )

    response = client.get(
        f"/ai-operations/runs/{submission.id}",
        headers=auth_headers(UserRole.REVIEWER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["submission"]["id"] == submission.id
    assert payload["task"]["name"] == "AI ops detail"
    assert payload["item_payload"] == {"text": "AI ops detail text"}
    assert payload["answer_payload"] == {"sentiment": "positive", "rationale": "Matches the text."}
    assert payload["review_config"]["pass_threshold"] == 80
    assert payload["review_config"]["return_threshold"] == 40
    assert payload["review_config"]["model_name"] == "ops-model"
    assert payload["idempotency_key"] == f"{submission.id}:1"
    assert payload["latest_ai_review"]["prompt_snapshot"] == "Review AI ops detail"
    assert payload["latest_ai_review"]["structured_response"]["summary"] == "Needs human confirmation."
    assert payload["latest_ai_review"]["error_metadata"]["failure_reason"] == "provider unavailable"
    assert payload["score_dimensions"] == [
        {"key": "accuracy", "score": 4, "reason": "Mostly correct."}
    ]
    assert payload["verdict"]["decision"] == "human_review"
    assert {entry["action"] for entry in payload["processing_logs"]} >= {
        "start_ai_review",
        "require_human_review",
    }
    assert payload["agent_workflow"]["current_status"] == "needs_human_review"


def test_retry_failed_ai_operation_supersedes_failed_run_and_preserves_idempotency(
    client: TestClient, db_session: Session
) -> None:
    from app.api.routes.ai_operations import get_ai_review_model

    submission = _submission_with_review(
        db_session,
        "retry",
        AIReviewDecision.HUMAN_REVIEW,
        SubmissionStatus.NEEDS_HUMAN_REVIEW,
        review_status="failed",
    )
    client.app.dependency_overrides[get_ai_review_model] = lambda: PassingRetryModel()

    response = client.post(
        f"/ai-operations/runs/{submission.id}/retry",
        headers=auth_headers(UserRole.REVIEWER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["retry_performed"] is True
    assert payload["detail"]["run_status"] == "passed"
    assert payload["detail"]["idempotency_key"] == f"{submission.id}:1"

    reviews = list(
        db_session.scalars(
            select(AIReview)
            .where(AIReview.submission_id == submission.id)
            .order_by(AIReview.created_at.asc(), AIReview.id.asc())
        )
    )
    assert sorted(review.status for review in reviews) == ["completed", "superseded"]
    superseded_review = next(review for review in reviews if review.status == "superseded")
    completed_review = next(review for review in reviews if review.status == "completed")
    assert superseded_review.error_metadata["superseded_by_retry"] is True
    assert completed_review.structured_response["idempotency_key"] == f"{submission.id}:1"
    db_session.refresh(submission)
    assert submission.status == SubmissionStatus.AI_PASSED
    retry_audit = db_session.scalar(
        select(AuditLog).where(AuditLog.entity_id == submission.id, AuditLog.action == "retry_ai_review")
    )
    assert retry_audit is not None


def test_retry_completed_ai_operation_returns_existing_review_without_duplicate(
    client: TestClient, db_session: Session
) -> None:
    submission = _submission_with_review(
        db_session,
        "completed",
        AIReviewDecision.PASS,
        SubmissionStatus.AI_PASSED,
    )

    response = client.post(
        f"/ai-operations/runs/{submission.id}/retry",
        headers=auth_headers(UserRole.OWNER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["retry_performed"] is False
    assert payload["detail"]["run_status"] == "passed"
    assert (
        db_session.query(AIReview)
        .filter(AIReview.submission_id == submission.id, AIReview.status == "completed")
        .count()
        == 1
    )


def test_retry_with_missing_provider_credentials_remains_controlled_fallback(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    from app.api.routes.ai_operations import get_ai_review_provider_config

    monkeypatch.delenv("LABELHUB_LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    submission = _submission_with_review(
        db_session,
        "missing-provider",
        AIReviewDecision.HUMAN_REVIEW,
        SubmissionStatus.NEEDS_HUMAN_REVIEW,
        review_status="failed",
    )
    client.app.dependency_overrides[get_ai_review_provider_config] = lambda: LLMProviderConfig(
        provider="deepseek",
        model="deepseek-chat",
        base_url="https://api.deepseek.com",
        api_key=None,
        temperature=0,
    )

    response = client.post(
        f"/ai-operations/runs/{submission.id}/retry",
        headers=auth_headers(UserRole.OWNER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["retry_performed"] is True
    assert payload["detail"]["run_status"] == "failed"
    assert payload["detail"]["latest_ai_review"]["decision"] == "human_review"
    assert "Missing LABELHUB_LLM_API_KEY" in payload["detail"]["latest_ai_review"]["error_metadata"]["failure_reason"]
    db_session.refresh(submission)
    assert submission.status == SubmissionStatus.NEEDS_HUMAN_REVIEW


class PassingRetryModel:
    def invoke(self, _prompt: str) -> dict:
        return {
            "decision": "pass",
            "overall_score": 96,
            "criterion_scores": [
                {"key": "accuracy", "score": 5, "reason": "Retry passed the rubric."}
            ],
            "summary": "Retry passed.",
            "return_reasons": [],
            "suggestions": [],
        }


def _submission_without_review(
    db: Session,
    prefix: str,
    status: SubmissionStatus,
) -> Submission:
    task, item, schema = _task_item_schema(db, prefix)
    submission = Submission(
        task=task,
        item=item,
        labeler_id="test-labeler",
        template_schema=schema,
        schema_version=1,
        answer_payload={"sentiment": "positive", "rationale": "Matches the text."},
        status=SubmissionStatus.SUBMITTED,
        attempt=1,
        submitted_at=datetime.now(UTC),
    )
    db.add(submission)
    db.flush()
    if status == SubmissionStatus.AI_REVIEWING:
        WorkflowService(db).transition_submission(
            submission.id,
            SubmissionAction.START_AI_REVIEW,
            ActorContext(user_id="ai-review-agent", role=UserRole.AI_AGENT),
        )
    db.commit()
    return submission


def _submission_with_review(
    db: Session,
    prefix: str,
    decision: AIReviewDecision,
    final_status: SubmissionStatus,
    *,
    review_status: str = "completed",
) -> Submission:
    submission = _submission_without_review(db, prefix, SubmissionStatus.SUBMITTED)
    workflow = WorkflowService(db)
    workflow.transition_submission(
        submission.id,
        SubmissionAction.START_AI_REVIEW,
        ActorContext(user_id="ai-review-agent", role=UserRole.AI_AGENT),
        metadata={"idempotency_key": f"{submission.id}:1"},
    )
    if final_status == SubmissionStatus.AI_PASSED:
        action = SubmissionAction.AI_PASS
    elif final_status == SubmissionStatus.AI_RETURNED:
        action = SubmissionAction.AI_RETURN
    else:
        action = SubmissionAction.REQUIRE_HUMAN_REVIEW
    workflow.transition_submission(
        submission.id,
        action,
        ActorContext(user_id="ai-review-agent", role=UserRole.AI_AGENT),
        reason="AI operation seeded.",
        metadata={"idempotency_key": f"{submission.id}:1", "decision": decision.value, "overall_score": 72},
    )
    structured_response = {
        "decision": decision.value,
        "overall_score": 72,
        "criterion_scores": [{"key": "accuracy", "score": 4, "reason": "Mostly correct."}],
        "summary": "Needs human confirmation.",
        "return_reasons": [],
        "suggestions": ["Check edge cases."],
        "idempotency_key": f"{submission.id}:1",
    }
    db.add(
        AIReview(
            submission_id=submission.id,
            decision=decision,
            overall_score=72,
            status=review_status,
            structured_response=structured_response,
            prompt_snapshot=f"Review AI ops {prefix}",
            model_name="ops-model",
            raw_provider_response={"provider": "mock"},
            error_metadata={
                "idempotency_key": f"{submission.id}:1",
                "retry_count": 2 if review_status == "failed" else 0,
                "failure_reason": "provider unavailable" if review_status == "failed" else None,
                "errors": ["provider unavailable"] if review_status == "failed" else [],
                "model_metadata": {
                    "provider": "mock",
                    "model": "ops-model",
                    "base_url": None,
                    "temperature": 0,
                    "has_credentials": False,
                },
            },
        )
    )
    db.commit()
    return submission


def _task_item_schema(db: Session, prefix: str) -> tuple[Task, TaskItem, TemplateSchema]:
    task = Task(
        name=f"AI ops {prefix}",
        description="AI operations test task",
        status=TaskStatus.PUBLISHED,
        created_by="test-owner",
    )
    item = TaskItem(task=task, external_id=f"{prefix}-row-1", payload={"text": f"AI ops {prefix} text"})
    schema = TemplateSchema(
        task=task,
        version=1,
        title=f"AI ops {prefix} schema",
        schema_payload={
            "version": 1,
            "title": f"AI ops {prefix} schema",
            "layout": {"type": "single", "groups": []},
            "fields": [
                {"id": "source", "type": "show_item", "label": "Source", "source": "item.payload.text"},
                {
                    "id": "sentiment",
                    "type": "radio",
                    "label": "Sentiment",
                    "required": True,
                    "options": [{"label": "Positive", "value": "positive"}],
                },
                {"id": "rationale", "type": "textarea", "label": "Rationale", "required": False},
            ],
            "llmTools": [],
            "validations": [],
            "visibilityRules": [],
        },
        is_published=True,
        created_by="test-owner",
    )
    db.add_all([task, item, schema])
    db.flush()
    db.add(
        ReviewConfig(
            task_id=task.id,
            prompt_template="Review the submitted annotation.",
            criteria=[{"key": "accuracy", "label": "Accuracy", "maxScore": 5}],
            pass_threshold=80,
            return_threshold=40,
            manual_review_threshold=60,
            model_name="ops-model",
            temperature=0,
            max_retries=2,
        )
    )
    db.flush()
    return task, item, schema
