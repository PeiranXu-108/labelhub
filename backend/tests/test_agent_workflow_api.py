from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import AIReviewDecision, SubmissionAction, UserRole
from app.models import AIReview, HumanReview, Submission
from app.services.workflow import ActorContext, WorkflowService
from tests.conftest import auth_headers
from tests.test_labeler_api import _claim_ready_assignment


def test_labeler_can_read_own_assignment_agent_workflow(
    client: TestClient, db_session: Session
) -> None:
    assignment_id = _claim_ready_assignment(client, db_session, task_name="Labeler workflow")
    submission = _submit_assignment(client, assignment_id)
    _persist_ai_passed_review(db_session, submission["id"])

    response = client.get(
        f"/labeler/assignments/{assignment_id}/agent-workflow",
        headers=auth_headers(UserRole.LABELER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["submission_id"] == submission["id"]
    assert payload["current_status"] == "ai_passed"
    assert [step["key"] for step in payload["steps"]] == [
        "submitted",
        "queued",
        "ai_reviewing",
        "ai_decision",
        "human_review",
        "final_review",
        "exportable",
    ]
    ai_step = next(step for step in payload["steps"] if step["key"] == "ai_decision")
    assert ai_step["status"] == "complete"
    assert ai_step["metadata"]["decision"] == "pass"
    assert ai_step["metadata"]["overall_score"] == 94


def test_labeler_cannot_read_another_assignment_agent_workflow(
    client: TestClient, db_session: Session
) -> None:
    assignment_id = _claim_ready_assignment(client, db_session, task_name="Owned workflow")

    response = client.get(
        f"/labeler/assignments/{assignment_id}/agent-workflow",
        headers=auth_headers(UserRole.LABELER, user_id="other-labeler"),
    )

    assert response.status_code == 403


def test_owner_reads_task_agent_workflow_summary(
    client: TestClient, db_session: Session
) -> None:
    assignment_id = _claim_ready_assignment(client, db_session, task_name="Owner workflow")
    submission = _submit_assignment(client, assignment_id)
    _persist_ai_passed_review(db_session, submission["id"])
    db_submission = db_session.get(Submission, submission["id"])
    assert db_submission is not None

    response = client.get(
        f"/tasks/{db_submission.task_id}/agent-workflow",
        headers=auth_headers(UserRole.OWNER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_id"] == db_submission.task_id
    assert payload["submission_status_counts"]["ai_passed"] == 1
    assert payload["ai_decision_counts"]["pass"] == 1
    assert payload["pending_count"] == 0
    assert payload["failed_count"] == 0
    assert payload["recent_workflows"][0]["submission_id"] == submission["id"]


def test_reviewer_submission_detail_includes_agent_workflow(
    client: TestClient, db_session: Session
) -> None:
    assignment_id = _claim_ready_assignment(client, db_session, task_name="Reviewer workflow")
    submission = _submit_assignment(client, assignment_id)
    _persist_ai_passed_review(db_session, submission["id"])

    response = client.get(
        f"/review/submissions/{submission['id']}",
        headers=auth_headers(UserRole.REVIEWER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["agent_workflow"]["submission_id"] == submission["id"]
    assert payload["agent_workflow"]["current_status"] == "ai_passed"


def _submit_assignment(client: TestClient, assignment_id: str) -> dict:
    response = client.post(
        f"/labeler/assignments/{assignment_id}/submit",
        headers=auth_headers(UserRole.LABELER),
        json={"answer_payload": {"sentiment": "positive"}},
    )
    assert response.status_code == 200
    return response.json()


def _persist_ai_passed_review(db_session: Session, submission_id: str) -> None:
    WorkflowService(db_session).transition_submission(
        submission_id,
        SubmissionAction.START_AI_REVIEW,
        ActorContext(user_id="ai-review-agent", role=UserRole.AI_AGENT),
    )
    WorkflowService(db_session).transition_submission(
        submission_id,
        SubmissionAction.AI_PASS,
        ActorContext(user_id="ai-review-agent", role=UserRole.AI_AGENT),
        reason="Ready for human approval.",
        metadata={"decision": "pass", "overall_score": 94},
    )
    db_session.add(
        AIReview(
            submission_id=submission_id,
            decision=AIReviewDecision.PASS,
            overall_score=94,
            status="completed",
            structured_response={"decision": "pass", "overall_score": 94},
            prompt_snapshot="Review this annotation.",
            model_name="deepseek-chat",
        )
    )
    db_session.add(
        HumanReview(
            submission_id=submission_id,
            reviewer_id="test-reviewer",
            decision="approve",
            reason=None,
            review_metadata={},
        )
    )
    db_session.commit()
