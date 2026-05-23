import pytest
from sqlalchemy.orm import Session

from app.agent.prompts import build_review_prompt
from app.agent.schemas import AIReviewResult
from app.domain.enums import AIReviewDecision, SubmissionStatus, TaskStatus, UserRole
from app.models import AIReview, ReviewConfig, Submission, Task, TaskItem, TemplateSchema, User
from app.services.ai_review import AIReviewService


def _submitted_submission(db: Session) -> Submission:
    owner = User(email="ai-owner@example.com", name="Owner", role=UserRole.OWNER)
    labeler = User(email="ai-labeler@example.com", name="Labeler", role=UserRole.LABELER)
    db.add_all([owner, labeler])
    db.flush()

    task = Task(
        name="Sentiment review",
        description="Review sentiment labels",
        status=TaskStatus.PUBLISHED,
        created_by=owner.id,
    )
    item = TaskItem(task=task, external_id="row-1", payload={"text": "I love this product"})
    schema = TemplateSchema(
        task=task,
        version=1,
        title="Sentiment schema",
        schema_payload={
            "version": 1,
            "title": "Sentiment schema",
            "fields": [
                {
                    "id": "text",
                    "type": "show_item",
                    "label": "Text",
                    "source": "item.payload.text",
                },
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
        },
        is_published=True,
        created_by=owner.id,
    )
    submission = Submission(
        task=task,
        item=item,
        labeler=labeler,
        template_schema=schema,
        schema_version=1,
        answer_payload={"sentiment": "positive"},
        status=SubmissionStatus.SUBMITTED,
        attempt=1,
    )
    db.add_all([task, item, schema, submission])
    db.flush()
    review_config = ReviewConfig(
        task_id=task.id,
        prompt_template="Check whether the answer follows the frozen schema.",
        criteria=[
            {"key": "accuracy", "label": "Accuracy", "maxScore": 5},
            {"key": "format", "label": "Format", "maxScore": 5},
        ],
        pass_threshold=80,
        return_threshold=40,
        manual_review_threshold=60,
        model_name="mock-review-model",
        temperature=0.0,
        max_retries=2,
    )
    db.add(review_config)
    db.flush()
    return submission


class QueueModel:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.calls = 0

    def invoke(self, _prompt: str) -> object:
        response = self.responses[self.calls]
        self.calls += 1
        if isinstance(response, Exception):
            raise response
        return response


def _passing_response() -> dict:
    return {
        "decision": "pass",
        "overall_score": 92,
        "criterion_scores": [
            {"key": "accuracy", "score": 5, "reason": "The sentiment is correct."},
            {"key": "format", "score": 5, "reason": "The answer matches the schema."},
        ],
        "summary": "Ready for human review.",
        "return_reasons": [],
        "suggestions": [],
    }


def test_prompt_builder_uses_submission_snapshots() -> None:
    prompt = build_review_prompt(
        task_snapshot={"id": "task-1", "name": "Original task", "description": "Original description"},
        item_snapshot={"id": "item-1", "external_id": "row-1", "payload": {"text": "Frozen text"}},
        submission_snapshot={
            "id": "submission-1",
            "attempt": 1,
            "answer_payload": {"sentiment": "positive"},
        },
        schema_snapshot={
            "version": 1,
            "title": "Frozen schema",
            "fields": [{"id": "sentiment", "type": "radio"}],
        },
        review_config_snapshot={
            "prompt_template": "Use only the snapshot.",
            "criteria": [{"key": "accuracy", "label": "Accuracy", "maxScore": 5}],
            "pass_threshold": 80,
            "return_threshold": 40,
            "manual_review_threshold": 60,
        },
    )

    assert "Frozen text" in prompt
    assert "Frozen schema" in prompt
    assert "Use only the snapshot." in prompt
    assert "Changed task" not in prompt


def test_structured_output_validates_valid_model_response() -> None:
    result = AIReviewResult.model_validate(_passing_response())

    assert result.decision == AIReviewDecision.PASS
    assert result.overall_score == 92
    assert result.criterion_scores[0].key == "accuracy"


def test_malformed_output_triggers_retry_and_persists_completed_review(db_session: Session) -> None:
    submission = _submitted_submission(db_session)
    model = QueueModel([{"decision": "pass", "overall_score": 101}, _passing_response()])

    review = AIReviewService(db_session, model=model).review_submission(submission.id)

    assert model.calls == 2
    assert review.status == "completed"
    assert review.decision == AIReviewDecision.PASS
    assert review.error_metadata["retry_count"] == 1
    db_session.refresh(submission)
    assert submission.status == SubmissionStatus.AI_PASSED


def test_max_retry_exhaustion_creates_human_review_fallback(db_session: Session) -> None:
    submission = _submitted_submission(db_session)
    model = QueueModel([RuntimeError("provider unavailable"), {"decision": "unknown"}])

    review = AIReviewService(db_session, model=model).review_submission(submission.id)

    assert model.calls == 2
    assert review.status == "failed"
    assert review.decision == AIReviewDecision.HUMAN_REVIEW
    assert review.error_metadata["retry_count"] == 2
    assert review.error_metadata["failure_reason"]
    db_session.refresh(submission)
    assert submission.status == SubmissionStatus.NEEDS_HUMAN_REVIEW


def test_missing_provider_credentials_fall_back_to_human_review(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    submission = _submitted_submission(db_session)
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    review = AIReviewService(db_session).review_submission(submission.id)

    assert review.status == "failed"
    assert review.decision == AIReviewDecision.HUMAN_REVIEW
    assert "Missing LLM_API_KEY" in review.error_metadata["failure_reason"]
    db_session.refresh(submission)
    assert submission.status == SubmissionStatus.NEEDS_HUMAN_REVIEW


def test_existing_completed_review_for_same_idempotency_key_is_not_duplicated(
    db_session: Session,
) -> None:
    submission = _submitted_submission(db_session)
    model = QueueModel([_passing_response(), _passing_response()])
    service = AIReviewService(db_session, model=model)

    first = service.review_submission(submission.id)
    second = service.review_submission(submission.id)

    assert first.id == second.id
    assert model.calls == 1
    assert db_session.query(AIReview).filter_by(submission_id=submission.id).count() == 1


@pytest.mark.parametrize(
    ("decision", "expected_status"),
    [
        ("pass", SubmissionStatus.AI_PASSED),
        ("return", SubmissionStatus.AI_RETURNED),
        ("human_review", SubmissionStatus.NEEDS_HUMAN_REVIEW),
    ],
)
def test_ai_decision_maps_to_workflow_transition(
    db_session: Session, decision: str, expected_status: SubmissionStatus
) -> None:
    submission = _submitted_submission(db_session)
    response = _passing_response()
    response["decision"] = decision
    if decision == "return":
        response["overall_score"] = 35
        response["return_reasons"] = ["Incorrect sentiment."]
    elif decision == "human_review":
        response["overall_score"] = 55

    AIReviewService(db_session, model=QueueModel([response])).review_submission(submission.id)

    db_session.refresh(submission)
    assert submission.status == expected_status
