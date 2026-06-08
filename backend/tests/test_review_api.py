from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import AIReviewDecision, SubmissionStatus, UserRole
from app.models import AIReview, HumanReview, Submission, Task, User
from app.core.security import hash_password
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


def _submitted_assignment(client: TestClient, *, task_payload: dict | None = None) -> dict:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Reviewable", **(task_payload or {})},
    ).json()
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


def _mark_reviewable(
    db_session: Session,
    submission_id: str,
    *,
    status: SubmissionStatus = SubmissionStatus.NEEDS_HUMAN_REVIEW,
    decision: AIReviewDecision = AIReviewDecision.HUMAN_REVIEW,
    score: int = 72,
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
            structured_response={"decision": decision.value, "overall_score": score},
            prompt_snapshot="Review this submission.",
            model_name="gpt-test",
        )
    )
    db_session.commit()


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


def test_reviewer_metrics_are_scoped_and_include_sla_context(
    client: TestClient, db_session: Session
) -> None:
    reviewer_headers = auth_headers(UserRole.REVIEWER)
    deadline = datetime.now(UTC) - timedelta(hours=2)
    approved_assignment = _submitted_assignment(client)
    returned_assignment = _submitted_assignment(client)
    pending_assignment = _submitted_assignment(client)
    _mark_reviewable(
        db_session,
        approved_assignment["submission"]["id"],
        status=SubmissionStatus.AI_PASSED,
        decision=AIReviewDecision.PASS,
        score=96,
    )
    _mark_reviewable(
        db_session,
        returned_assignment["submission"]["id"],
        status=SubmissionStatus.NEEDS_HUMAN_REVIEW,
        decision=AIReviewDecision.HUMAN_REVIEW,
        score=62,
    )
    _mark_reviewable(db_session, pending_assignment["submission"]["id"])
    pending_task = db_session.get(Task, pending_assignment["task_id"])
    assert pending_task is not None
    pending_task.deadline_at = deadline
    db_session.commit()

    approved = client.post(
        f"/review/submissions/{approved_assignment['submission']['id']}/approve",
        headers=reviewer_headers,
        json={"stage": "final_review"},
    )
    returned = client.post(
        f"/review/submissions/{returned_assignment['submission']['id']}/return",
        headers=reviewer_headers,
        json={"stage": "initial_review", "reason": "Needs correction."},
    )
    other_reviewer = User(
        id="other-reviewer",
        email="other-reviewer@example.com",
        name="Other Reviewer",
        role=UserRole.REVIEWER,
        password_hash=hash_password("LabelHubTest123!"),
    )
    db_session.add(other_reviewer)
    db_session.add(
        HumanReview(
            submission_id=pending_assignment["submission"]["id"],
            reviewer_id=other_reviewer.id,
            decision="approve",
            stage="final_review",
            round=1,
            compared_from_attempt=None,
            compared_to_attempt=1,
            reason=None,
            review_metadata={},
            created_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    response = client.get("/review/metrics", headers=reviewer_headers)

    assert approved.status_code == 200
    assert returned.status_code == 200
    assert response.status_code == 200
    payload = response.json()
    assert payload["reviewed_today"] == 2
    assert payload["approved_today"] == 1
    assert payload["returned_today"] == 1
    assert payload["pass_rate"] == 0.5
    assert payload["pending_review_count"] == 1
    assert payload["sla"]["source"] == "task.deadline_at"
    assert payload["sla"]["overdue_count"] == 1
    assert payload["sla"]["pending_with_deadline_count"] == 1
    assert payload["sla"]["nearest_deadline_at"] is not None
    assert payload["sla"]["seconds_until_nearest_deadline"] < 0


def test_submission_audit_export_includes_review_metadata_and_denies_labelers(
    client: TestClient, db_session: Session
) -> None:
    assignment = _submitted_assignment(client)
    submission_id = assignment["submission"]["id"]
    _mark_reviewable(db_session, submission_id, score=64)
    reviewer_headers = auth_headers(UserRole.REVIEWER)
    returned = client.post(
        f"/review/submissions/{submission_id}/return",
        headers=reviewer_headers,
        json={"stage": "initial_review", "reason": "Needs a clearer rationale."},
    )

    response = client.get(
        f"/review/submissions/{submission_id}/audit-export",
        headers=reviewer_headers,
    )
    labeler_response = client.get(
        f"/review/submissions/{submission_id}/audit-export",
        headers=auth_headers(UserRole.LABELER, user_id=assignment["labeler_id"]),
    )

    assert returned.status_code == 200
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "review-audit-submission-" in response.headers["content-disposition"]
    payload = response.json()
    assert payload["scope"] == "submission"
    assert payload["submission_count"] == 1
    exported = payload["submissions"][0]
    assert exported["submission"]["id"] == submission_id
    assert {entry["action"] for entry in exported["audit_logs"]} >= {"submit", "return"}
    assert exported["human_reviews"][0]["reason"] == "Needs a clearer rationale."
    assert exported["ai_reviews"][0]["overall_score"] == 64
    assert labeler_response.status_code == 403


def test_task_audit_export_is_available_to_owner_and_reviewer(
    client: TestClient, db_session: Session
) -> None:
    assignment = _submitted_assignment(client)
    task_id = assignment["task_id"]
    _mark_reviewable(db_session, assignment["submission"]["id"])

    reviewer_response = client.get(
        f"/review/tasks/{task_id}/audit-export",
        headers=auth_headers(UserRole.REVIEWER),
    )
    owner_response = client.get(
        f"/review/tasks/{task_id}/audit-export",
        headers=auth_headers(UserRole.OWNER),
    )
    labeler_response = client.get(
        f"/review/tasks/{task_id}/audit-export",
        headers=auth_headers(UserRole.LABELER, user_id=assignment["labeler_id"]),
    )

    assert reviewer_response.status_code == 200
    assert owner_response.status_code == 200
    assert reviewer_response.json()["scope"] == "task"
    assert reviewer_response.json()["task_id"] == task_id
    assert reviewer_response.json()["submission_count"] == 1
    assert labeler_response.status_code == 403
