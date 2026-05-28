from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import AIReviewDecision, SubmissionStatus, UserRole
from app.models import AIReview, Submission
from tests.conftest import auth_headers


def _schema_payload(title: str, *, version: int = 1, field_id: str = "sentiment") -> dict:
    return {
        "version": version,
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
                "id": field_id,
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


def _create_claimed_assignment(client: TestClient, *, task_name: str = "Review contracts") -> dict:
    owner_headers = auth_headers(UserRole.OWNER)
    labeler_headers = auth_headers(UserRole.LABELER)
    task = client.post("/tasks", headers=owner_headers, json={"name": task_name}).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": f"{task_name}-row", "payload": {"text": task_name}}]},
    )
    client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _schema_payload("Frozen v1")},
    )
    client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    assignment = client.post(f"/labeler/tasks/{task['id']}/claim", headers=labeler_headers).json()
    assignment["owner_headers"] = owner_headers
    assignment["labeler_headers"] = auth_headers(UserRole.LABELER, user_id=assignment["labeler_id"])
    assignment["task"] = task
    return assignment


def _submit_assignment(client: TestClient, assignment: dict, answer: str = "neutral") -> dict:
    response = client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=assignment["labeler_headers"],
        json={"answer_payload": {"sentiment": answer}},
    )
    assert response.status_code == 200
    return response.json()


def _publish_newer_template(client: TestClient, assignment: dict) -> dict:
    client.post(
        f"/tasks/{assignment['task_id']}/template/draft",
        headers=assignment["owner_headers"],
        json={"schema": _schema_payload("Mutable v2", version=2, field_id="sentiment_v2")},
    )
    response = client.post(
        f"/tasks/{assignment['task_id']}/template/publish",
        headers=assignment["owner_headers"],
    )
    assert response.status_code == 200
    return response.json()


def _mark_reviewable(
    db_session: Session,
    submission_id: str,
    *,
    status: SubmissionStatus = SubmissionStatus.NEEDS_HUMAN_REVIEW,
    decision: AIReviewDecision = AIReviewDecision.HUMAN_REVIEW,
    score: int = 72,
    created_at: datetime | None = None,
) -> None:
    submission = db_session.get(Submission, submission_id)
    assert submission is not None
    submission.status = status
    db_session.add(
        AIReview(
            submission_id=submission_id,
            decision=decision,
            overall_score=score,
            status="completed",
            structured_response={
                "decision": decision.value,
                "overall_score": score,
                "criteria": [{"name": "accuracy", "score": score}],
            },
            prompt_snapshot="Grade the submitted annotation.",
            model_name="gpt-test",
            created_at=created_at,
        )
    )
    db_session.commit()


def test_assignment_detail_returns_frozen_template_and_latest_return_reason(
    client: TestClient, db_session: Session
) -> None:
    assignment = _create_claimed_assignment(client)
    submission = _submit_assignment(client, assignment, answer="negative")
    _publish_newer_template(client, assignment)
    _mark_reviewable(db_session, submission["id"])
    reviewer_headers = auth_headers(UserRole.REVIEWER)
    returned = client.post(
        f"/review/submissions/{submission['id']}/return",
        headers=reviewer_headers,
        json={"reason": "Evidence does not support the negative sentiment."},
    )
    assert returned.status_code == 200

    response = client.get(
        f"/labeler/assignments/{assignment['id']}",
        headers=assignment["labeler_headers"],
    )
    other_labeler = client.get(
        f"/labeler/assignments/{assignment['id']}",
        headers=auth_headers(UserRole.LABELER, user_id="other-labeler"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["template_schema"]["version"] == 1
    assert payload["template_schema"]["title"] == "Frozen v1"
    assert payload["latest_human_review"]["decision"] == "return"
    assert payload["latest_human_review"]["reason"] == "Evidence does not support the negative sentiment."
    assert other_labeler.status_code == 403


def test_review_detail_returns_persisted_audit_ai_human_attempts_and_frozen_template(
    client: TestClient, db_session: Session
) -> None:
    assignment = _create_claimed_assignment(client)
    first_submission = _submit_assignment(client, assignment, answer="negative")
    _publish_newer_template(client, assignment)
    base_time = datetime(2026, 5, 24, tzinfo=UTC)
    _mark_reviewable(db_session, first_submission["id"], score=61, created_at=base_time)
    reviewer_headers = auth_headers(UserRole.REVIEWER)
    returned = client.post(
        f"/review/submissions/{first_submission['id']}/return",
        headers=reviewer_headers,
        json={"reason": "Please align sentiment with the source text."},
    )
    assert returned.status_code == 200
    client.put(
        f"/labeler/assignments/{assignment['id']}/draft",
        headers=assignment["labeler_headers"],
        json={"answer_payload": {"sentiment": "positive"}},
    )
    second_submission = _submit_assignment(client, assignment, answer="positive")
    _mark_reviewable(
        db_session,
        second_submission["id"],
        status=SubmissionStatus.AI_PASSED,
        decision=AIReviewDecision.PASS,
        score=96,
        created_at=base_time + timedelta(minutes=1),
    )

    response = client.get(
        f"/review/submissions/{second_submission['id']}",
        headers=reviewer_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["template_schema"]["version"] == 1
    assert payload["ai_reviews"][0]["structured_response"]["overall_score"] == 96
    assert payload["ai_reviews"][0]["prompt_snapshot"] == "Grade the submitted annotation."
    assert payload["ai_reviews"][0]["model_name"] == "gpt-test"
    assert payload["human_reviews"][0]["reason"] == "Please align sentiment with the source text."
    assert {entry["action"] for entry in payload["audit_logs"]} >= {"submit", "return"}
    assert [attempt["attempt"] for attempt in payload["previous_attempts"]] == [1]
    assert payload["previous_attempts"][0]["answer_payload"] == {"sentiment": "negative"}


def test_review_queue_returns_queue_items_and_server_backed_filters(
    client: TestClient, db_session: Session
) -> None:
    first = _create_claimed_assignment(client, task_name="First")
    first_submission = _submit_assignment(client, first, answer="neutral")
    _mark_reviewable(
        db_session,
        first_submission["id"],
        status=SubmissionStatus.NEEDS_HUMAN_REVIEW,
        decision=AIReviewDecision.HUMAN_REVIEW,
        score=71,
    )
    second = _create_claimed_assignment(client, task_name="Second")
    second_submission = _submit_assignment(client, second, answer="positive")
    _mark_reviewable(
        db_session,
        second_submission["id"],
        status=SubmissionStatus.AI_PASSED,
        decision=AIReviewDecision.PASS,
        score=94,
    )
    reviewer_headers = auth_headers(UserRole.REVIEWER)

    by_decision = client.get("/review/queue?ai_decision=pass", headers=reviewer_headers)
    by_score = client.get("/review/queue?min_score=70&max_score=80", headers=reviewer_headers)
    by_task_status = client.get(
        f"/review/queue?task_id={first['task_id']}&status=needs_human_review",
        headers=reviewer_headers,
    )
    labeler_forbidden = client.get("/review/queue", headers=first["labeler_headers"])

    assert by_decision.status_code == 200
    assert [item["submission"]["id"] for item in by_decision.json()] == [second_submission["id"]]
    assert by_decision.json()[0]["latest_ai_review"]["decision"] == "pass"
    assert by_decision.json()[0]["task"]["id"] == second["task_id"]
    assert [item["submission"]["id"] for item in by_score.json()] == [first_submission["id"]]
    assert [item["submission"]["id"] for item in by_task_status.json()] == [first_submission["id"]]
    assert labeler_forbidden.status_code == 403
