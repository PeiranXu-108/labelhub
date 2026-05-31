from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import AIReviewDecision, SubmissionStatus, UserRole
from app.models import AIReview, AuditLog, Submission
from tests.conftest import auth_headers


def _schema_payload() -> dict:
    return {
        "version": 1,
        "title": "Multistage review schema",
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
            {
                "id": "rationale",
                "type": "textarea",
                "label": "Rationale",
                "required": False,
                "maxLength": 500,
            },
            {
                "id": "obsolete_note",
                "type": "text",
                "label": "Obsolete note",
                "required": False,
                "maxLength": 120,
            },
        ],
        "llmTools": [],
        "validations": [],
        "visibilityRules": [],
    }


def _create_claimed_assignment(client: TestClient) -> dict:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Multistage review"},
    ).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "Great support reply."}}]},
    )
    client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": _schema_payload()},
    )
    client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    assignment = client.post(
        f"/labeler/tasks/{task['id']}/claim",
        headers=auth_headers(UserRole.LABELER),
    ).json()
    assignment["labeler_headers"] = auth_headers(
        UserRole.LABELER, user_id=assignment["labeler_id"]
    )
    return assignment


def _submit_assignment(client: TestClient, assignment: dict, answer_payload: dict) -> dict:
    response = client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=assignment["labeler_headers"],
        json={"answer_payload": answer_payload},
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
            structured_response={"decision": decision.value, "overall_score": score},
            prompt_snapshot="Review the labeler answer.",
            model_name="gpt-test",
            created_at=created_at,
        )
    )
    db_session.commit()


def test_initial_review_queue_filter_and_return_persist_stage_round(
    client: TestClient, db_session: Session
) -> None:
    assignment = _create_claimed_assignment(client)
    submission = _submit_assignment(
        client,
        assignment,
        {"sentiment": "negative", "obsolete_note": "first pass note"},
    )
    _mark_reviewable(db_session, submission["id"])
    reviewer_headers = auth_headers(UserRole.REVIEWER)

    initial_queue = client.get("/review/queue?review_stage=initial_review", headers=reviewer_headers)
    re_review_queue = client.get("/review/queue?review_stage=re_review", headers=reviewer_headers)

    assert initial_queue.status_code == 200
    assert [item["submission"]["id"] for item in initial_queue.json()] == [submission["id"]]
    assert initial_queue.json()[0]["current_stage"] == "initial_review"
    assert re_review_queue.status_code == 200
    assert re_review_queue.json() == []

    returned = client.post(
        f"/review/submissions/{submission['id']}/return",
        headers=reviewer_headers,
        json={"stage": "initial_review", "reason": "Sentiment does not match the source."},
    )

    assert returned.status_code == 200
    detail = client.get(f"/review/submissions/{submission['id']}", headers=reviewer_headers).json()
    latest = detail["human_reviews"][-1]
    assert latest["stage"] == "initial_review"
    assert latest["round"] == 1
    assert latest["compared_from_attempt"] is None
    assert latest["compared_to_attempt"] == 1
    assert detail["stage_history"][-1]["stage"] == "initial_review"
    return_audit = db_session.scalars(
        select(AuditLog)
        .where(AuditLog.entity_id == submission["id"], AuditLog.action == "return")
        .order_by(AuditLog.created_at.desc())
    ).first()
    assert return_audit is not None
    assert return_audit.details["review_stage"] == "initial_review"
    assert return_audit.details["round"] == 1


def test_re_review_detail_returns_stage_history_and_snapshot_round_diff(
    client: TestClient, db_session: Session
) -> None:
    assignment = _create_claimed_assignment(client)
    first = _submit_assignment(
        client,
        assignment,
        {"sentiment": "negative", "obsolete_note": "remove this note"},
    )
    base_time = datetime(2026, 5, 31, tzinfo=UTC)
    _mark_reviewable(db_session, first["id"], created_at=base_time)
    reviewer_headers = auth_headers(UserRole.REVIEWER)
    returned = client.post(
        f"/review/submissions/{first['id']}/return",
        headers=reviewer_headers,
        json={"stage": "initial_review", "reason": "Needs a positive sentiment label."},
    )
    assert returned.status_code == 200
    client.put(
        f"/labeler/assignments/{assignment['id']}/draft",
        headers=assignment["labeler_headers"],
        json={"answer_payload": {"sentiment": "positive", "rationale": "The reply helped."}},
    )
    second = _submit_assignment(
        client,
        assignment,
        {"sentiment": "positive", "rationale": "The reply helped."},
    )
    _mark_reviewable(
        db_session,
        second["id"],
        status=SubmissionStatus.AI_PASSED,
        decision=AIReviewDecision.PASS,
        score=96,
        created_at=base_time + timedelta(minutes=1),
    )

    detail_response = client.get(f"/review/submissions/{second['id']}", headers=reviewer_headers)

    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["current_stage"] == "re_review"
    assert detail["stage_history"][0]["stage"] == "initial_review"
    assert [attempt["attempt"] for attempt in detail["previous_attempts"]] == [1]
    assert len(detail["round_diffs"]) == 1
    diff = detail["round_diffs"][0]
    assert diff["from_attempt"] == 1
    assert diff["to_attempt"] == 2
    fields = {field["field_id"]: field for field in diff["fields"]}
    assert fields["sentiment"]["field_label"] == "Sentiment"
    assert fields["sentiment"]["change_type"] == "changed"
    assert fields["sentiment"]["from_value"] == "negative"
    assert fields["sentiment"]["to_value"] == "positive"
    assert fields["rationale"]["field_label"] == "Rationale"
    assert fields["rationale"]["change_type"] == "added"
    assert fields["rationale"]["from_value"] is None
    assert fields["rationale"]["to_value"] == "The reply helped."
    assert fields["obsolete_note"]["field_label"] == "Obsolete note"
    assert fields["obsolete_note"]["change_type"] == "removed"
    assert fields["obsolete_note"]["from_value"] == "remove this note"
    assert fields["obsolete_note"]["to_value"] is None


def test_final_review_approval_is_distinct_and_invalid_stage_decision_is_rejected(
    client: TestClient, db_session: Session
) -> None:
    assignment = _create_claimed_assignment(client)
    first = _submit_assignment(client, assignment, {"sentiment": "negative"})
    _mark_reviewable(db_session, first["id"])
    reviewer_headers = auth_headers(UserRole.REVIEWER)
    returned = client.post(
        f"/review/submissions/{first['id']}/return",
        headers=reviewer_headers,
        json={"stage": "initial_review", "reason": "Try again."},
    )
    assert returned.status_code == 200
    client.put(
        f"/labeler/assignments/{assignment['id']}/draft",
        headers=assignment["labeler_headers"],
        json={"answer_payload": {"sentiment": "positive"}},
    )
    second = _submit_assignment(client, assignment, {"sentiment": "positive"})
    _mark_reviewable(
        db_session,
        second["id"],
        status=SubmissionStatus.AI_PASSED,
        decision=AIReviewDecision.PASS,
        score=95,
    )

    invalid = client.post(
        f"/review/submissions/{second['id']}/approve",
        headers=reviewer_headers,
        json={"stage": "initial_review"},
    )
    approved = client.post(
        f"/review/submissions/{second['id']}/approve",
        headers=reviewer_headers,
        json={"stage": "final_review"},
    )

    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "INVALID_REVIEW_STAGE"
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    detail = client.get(f"/review/submissions/{second['id']}", headers=reviewer_headers).json()
    final_review = detail["human_reviews"][-1]
    assert final_review["decision"] == "approve"
    assert final_review["stage"] == "final_review"
    assert final_review["round"] == 2
    assert final_review["compared_from_attempt"] == 1
    assert final_review["compared_to_attempt"] == 2
    assert detail["current_stage"] == "final_review"


def test_initial_review_approve_defaults_to_terminal_final_review(
    client: TestClient, db_session: Session
) -> None:
    assignment = _create_claimed_assignment(client)
    submission = _submit_assignment(client, assignment, {"sentiment": "positive"})
    _mark_reviewable(
        db_session,
        submission["id"],
        status=SubmissionStatus.AI_PASSED,
        decision=AIReviewDecision.PASS,
        score=98,
    )
    reviewer_headers = auth_headers(UserRole.REVIEWER)

    response = client.post(f"/review/submissions/{submission['id']}/approve", headers=reviewer_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    detail = client.get(f"/review/submissions/{submission['id']}", headers=reviewer_headers).json()
    assert detail["human_reviews"][-1]["stage"] == "final_review"
    assert detail["human_reviews"][-1]["round"] == 1
    assert detail["current_stage"] == "final_review"
