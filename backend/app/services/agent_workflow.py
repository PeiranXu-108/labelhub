from collections import Counter
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import AIReviewDecision, SubmissionStatus
from app.models import AIReview, AuditLog, HumanReview, Submission, Task
from app.schemas.agent_workflow import (
    AgentWorkflowRead,
    AgentWorkflowStepRead,
    TaskAgentWorkflowSummaryRead,
)


STEP_ORDER = [
    "submitted",
    "queued",
    "ai_reviewing",
    "ai_decision",
    "human_review",
    "final_review",
    "exportable",
]


class AgentWorkflowService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def workflow_for_submission(self, submission: Submission) -> AgentWorkflowRead:
        audit_logs = self._audit_logs(submission.id)
        ai_reviews = self._ai_reviews(submission.id)
        human_reviews = self._human_reviews(submission.id)
        latest_ai_review = ai_reviews[0] if ai_reviews else None
        latest_human_review = human_reviews[-1] if human_reviews else None

        return AgentWorkflowRead(
            submission_id=submission.id,
            assignment_id=submission.assignment_id,
            task_id=submission.task_id,
            current_status=SubmissionStatus(submission.status).value,
            steps=[
                self._submitted_step(audit_logs, submission),
                self._queued_step(audit_logs, submission),
                self._ai_reviewing_step(audit_logs, submission),
                self._ai_decision_step(audit_logs, latest_ai_review, submission),
                self._human_review_step(audit_logs, submission),
                self._final_review_step(audit_logs, latest_human_review, submission),
                self._exportable_step(audit_logs, submission),
            ],
        )

    def task_summary(self, task: Task, *, limit: int = 8) -> TaskAgentWorkflowSummaryRead:
        submissions = list(
            self.db.scalars(
                select(Submission)
                .where(Submission.task_id == task.id)
                .order_by(Submission.updated_at.desc(), Submission.id.desc())
            )
        )
        status_counts = Counter(SubmissionStatus(submission.status).value for submission in submissions)
        latest_reviews: list[AIReview] = []
        for submission in submissions:
            reviews = self._ai_reviews(submission.id)
            if reviews:
                latest_reviews.append(reviews[0])
        decision_counts = Counter(review.decision.value for review in latest_reviews)
        pending_statuses = {
            SubmissionStatus.SUBMITTED,
            SubmissionStatus.AI_REVIEWING,
            SubmissionStatus.NEEDS_HUMAN_REVIEW,
            SubmissionStatus.HUMAN_REVIEWING,
        }
        failed_count = sum(1 for review in latest_reviews if review.status == "failed")
        return TaskAgentWorkflowSummaryRead(
            task_id=task.id,
            submission_status_counts=dict(status_counts),
            ai_decision_counts=dict(decision_counts),
            pending_count=sum(1 for submission in submissions if SubmissionStatus(submission.status) in pending_statuses),
            failed_count=failed_count,
            recent_workflows=[self.workflow_for_submission(submission) for submission in submissions[:limit]],
        )

    def _submitted_step(
        self, audit_logs: list[AuditLog], submission: Submission
    ) -> AgentWorkflowStepRead:
        audit = _find_audit(audit_logs, "submit")
        is_done = submission.submitted_at is not None
        return _step(
            "submitted",
            "Submitted",
            "complete" if is_done else "pending",
            timestamp=audit.created_at if audit else submission.submitted_at,
            actor_role=audit.actor_role if audit else "labeler" if is_done else None,
            summary="Labeler submitted answers." if is_done else "Waiting for labeler submission.",
        )

    def _queued_step(self, audit_logs: list[AuditLog], submission: Submission) -> AgentWorkflowStepRead:
        start_audit = _find_audit(audit_logs, "start_ai_review")
        submitted = submission.submitted_at is not None
        return _step(
            "queued",
            "Queued",
            "complete" if start_audit else "active" if submitted else "pending",
            timestamp=submission.submitted_at,
            actor_role="system" if submitted else None,
            summary="AI review job queued." if submitted else "Waiting for submission.",
        )

    def _ai_reviewing_step(
        self, audit_logs: list[AuditLog], submission: Submission
    ) -> AgentWorkflowStepRead:
        start_audit = _find_audit(audit_logs, "start_ai_review")
        current = SubmissionStatus(submission.status)
        completed = _find_audit(audit_logs, "ai_pass") or _find_audit(audit_logs, "ai_return") or _find_audit(
            audit_logs, "require_human_review"
        )
        return _step(
            "ai_reviewing",
            "AI reviewing",
            "complete" if completed else "active" if current == SubmissionStatus.AI_REVIEWING else "pending",
            timestamp=start_audit.created_at if start_audit else None,
            actor_role=start_audit.actor_role if start_audit else None,
            summary="DeepSeek agent is evaluating the submission." if start_audit else "Waiting for AI worker.",
        )

    def _ai_decision_step(
        self,
        audit_logs: list[AuditLog],
        latest_ai_review: AIReview | None,
        submission: Submission,
    ) -> AgentWorkflowStepRead:
        audit = _find_audit(audit_logs, "ai_pass") or _find_audit(audit_logs, "ai_return") or _find_audit(
            audit_logs, "require_human_review"
        )
        if latest_ai_review is None:
            return _step(
                "ai_decision",
                "AI decision",
                "pending",
                summary="No AI decision has been persisted yet.",
            )
        status = "failed" if latest_ai_review.status == "failed" else "complete"
        return _step(
            "ai_decision",
            "AI decision",
            status,
            timestamp=latest_ai_review.created_at,
            actor_role=audit.actor_role if audit else "ai_agent",
            summary=_ai_summary(latest_ai_review),
            metadata={
                "decision": latest_ai_review.decision.value,
                "overall_score": latest_ai_review.overall_score,
                "model_name": latest_ai_review.model_name,
                "status": latest_ai_review.status,
            },
        )

    def _human_review_step(
        self, audit_logs: list[AuditLog], submission: Submission
    ) -> AgentWorkflowStepRead:
        audit = _find_audit(audit_logs, "start_human_review")
        current = SubmissionStatus(submission.status)
        final = current in {SubmissionStatus.APPROVED, SubmissionStatus.RETURNED, SubmissionStatus.EXPORTABLE}
        return _step(
            "human_review",
            "Human review",
            "complete" if final else "active" if current == SubmissionStatus.HUMAN_REVIEWING else "pending",
            timestamp=audit.created_at if audit else None,
            actor_role=audit.actor_role if audit else None,
            summary="Reviewer is checking the AI-routed submission." if audit else "Waiting for reviewer action.",
        )

    def _final_review_step(
        self,
        audit_logs: list[AuditLog],
        latest_human_review: HumanReview | None,
        submission: Submission,
    ) -> AgentWorkflowStepRead:
        audit = _find_audit(audit_logs, "approve") or _find_audit(audit_logs, "return")
        current = SubmissionStatus(submission.status)
        is_final = current in {SubmissionStatus.APPROVED, SubmissionStatus.RETURNED, SubmissionStatus.EXPORTABLE}
        return _step(
            "final_review",
            "Approved/Returned",
            "complete" if is_final else "pending",
            timestamp=latest_human_review.created_at if latest_human_review else audit.created_at if audit else None,
            actor_role=audit.actor_role if audit else "reviewer" if latest_human_review else None,
            summary=_human_summary(latest_human_review) if latest_human_review else "No human decision yet.",
            metadata={
                "decision": latest_human_review.decision,
                "reason": latest_human_review.reason,
            }
            if latest_human_review
            else {},
        )

    def _exportable_step(
        self, audit_logs: list[AuditLog], submission: Submission
    ) -> AgentWorkflowStepRead:
        audit = _find_audit(audit_logs, "mark_exportable")
        is_exportable = SubmissionStatus(submission.status) == SubmissionStatus.EXPORTABLE
        return _step(
            "exportable",
            "Exportable",
            "complete" if is_exportable else "pending",
            timestamp=audit.created_at if audit else None,
            actor_role=audit.actor_role if audit else None,
            summary="Submission is ready for export." if is_exportable else "Waiting for export readiness.",
        )

    def _audit_logs(self, submission_id: str) -> list[AuditLog]:
        return list(
            self.db.scalars(
                select(AuditLog)
                .where(AuditLog.entity_type == "submission", AuditLog.entity_id == submission_id)
                .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
            )
        )

    def _ai_reviews(self, submission_id: str) -> list[AIReview]:
        return list(
            self.db.scalars(
                select(AIReview)
                .where(AIReview.submission_id == submission_id)
                .order_by(AIReview.created_at.desc(), AIReview.id.desc())
            )
        )

    def _human_reviews(self, submission_id: str) -> list[HumanReview]:
        return list(
            self.db.scalars(
                select(HumanReview)
                .where(HumanReview.submission_id == submission_id)
                .order_by(HumanReview.created_at.asc(), HumanReview.id.asc())
            )
        )


def _step(
    key: str,
    label: str,
    status: str,
    *,
    timestamp: datetime | None = None,
    actor_role: str | None = None,
    summary: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AgentWorkflowStepRead:
    return AgentWorkflowStepRead(
        key=key,
        label=label,
        status=status,
        timestamp=timestamp,
        actor_role=actor_role,
        summary=summary,
        metadata=metadata or {},
    )


def _find_audit(audit_logs: list[AuditLog], action: str) -> AuditLog | None:
    return next((audit for audit in audit_logs if audit.action == action), None)


def _ai_summary(review: AIReview) -> str:
    response = review.structured_response or {}
    summary = response.get("summary")
    if isinstance(summary, str) and summary:
        return summary
    if review.decision == AIReviewDecision.PASS:
        return "AI passed this submission."
    if review.decision == AIReviewDecision.RETURN:
        return "AI recommends returning this submission."
    return "AI routed this submission to human review."


def _human_summary(review: HumanReview | None) -> str:
    if review is None:
        return "No human decision yet."
    if review.decision == "approve":
        return "Reviewer approved this submission."
    return review.reason or "Reviewer returned this submission."
