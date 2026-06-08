from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import SubmissionStatus, UserRole
from app.models import AIReview, AuditLog, HumanReview, Submission, Task
from app.services.workflow import ActorContext, WorkflowError


PENDING_REVIEW_STATUSES = {
    SubmissionStatus.AI_PASSED,
    SubmissionStatus.NEEDS_HUMAN_REVIEW,
    SubmissionStatus.HUMAN_REVIEWING,
}


class ReviewOperationsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def reviewer_metrics(self, actor: ActorContext) -> dict[str, Any]:
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)
        reviews_today = list(
            self.db.scalars(
                select(HumanReview)
                .where(
                    HumanReview.reviewer_id == actor.user_id,
                    HumanReview.created_at >= today_start,
                    HumanReview.created_at < tomorrow_start,
                )
                .order_by(HumanReview.created_at.asc(), HumanReview.id.asc())
            )
        )
        approved_today = sum(1 for review in reviews_today if review.decision == "approve")
        returned_today = sum(1 for review in reviews_today if review.decision == "return")
        reviewed_today = len(reviews_today)

        pending_submissions = self._pending_review_submissions()
        return {
            "reviewed_today": reviewed_today,
            "approved_today": approved_today,
            "returned_today": returned_today,
            "pass_rate": round(approved_today / reviewed_today, 4) if reviewed_today else None,
            "pending_review_count": len(pending_submissions),
            "sla": self._sla_context(pending_submissions, now=now),
        }

    def submission_audit_export(self, submission_id: str, actor: ActorContext) -> dict[str, Any]:
        submission = self.db.get(Submission, submission_id)
        if submission is None:
            raise WorkflowError("SUBMISSION_NOT_FOUND", "Submission was not found")
        self._ensure_can_export_submission(submission, actor)
        return self._audit_export_payload(
            scope="submission",
            task_id=submission.task_id,
            submissions=[submission],
        )

    def task_audit_export(self, task_id: str, actor: ActorContext) -> dict[str, Any]:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        self._ensure_can_export_task(task, actor)
        submissions = list(
            self.db.scalars(
                select(Submission)
                .where(Submission.task_id == task_id)
                .order_by(Submission.created_at.asc(), Submission.id.asc())
            )
        )
        return self._audit_export_payload(scope="task", task_id=task_id, submissions=submissions)

    def _pending_review_submissions(self) -> list[Submission]:
        return list(
            self.db.scalars(
                select(Submission)
                .where(Submission.status.in_(PENDING_REVIEW_STATUSES))
                .order_by(Submission.updated_at.desc(), Submission.id.asc())
            )
        )

    def _sla_context(self, submissions: list[Submission], *, now: datetime) -> dict[str, Any]:
        deadlines = [
            deadline
            for deadline in (_as_utc(submission.task.deadline_at) for submission in submissions)
            if deadline is not None
        ]
        nearest_deadline = min(deadlines) if deadlines else None
        return {
            "source": "task.deadline_at",
            "reference_time": now,
            "nearest_deadline_at": nearest_deadline,
            "seconds_until_nearest_deadline": (
                int((nearest_deadline - now).total_seconds()) if nearest_deadline else None
            ),
            "overdue_count": sum(1 for deadline in deadlines if deadline < now),
            "pending_with_deadline_count": len(deadlines),
        }

    def _audit_export_payload(
        self,
        *,
        scope: str,
        task_id: str,
        submissions: list[Submission],
    ) -> dict[str, Any]:
        return {
            "scope": scope,
            "task_id": task_id,
            "generated_at": datetime.now(UTC),
            "submission_count": len(submissions),
            "submissions": [self._audit_export_record(submission) for submission in submissions],
        }

    def _audit_export_record(self, submission: Submission) -> dict[str, Any]:
        return {
            "submission": submission,
            "task": submission.task,
            "audit_logs": list(
                self.db.scalars(
                    select(AuditLog)
                    .where(
                        AuditLog.entity_type == "submission",
                        AuditLog.entity_id == submission.id,
                    )
                    .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
                )
            ),
            "ai_reviews": list(
                self.db.scalars(
                    select(AIReview)
                    .where(AIReview.submission_id == submission.id)
                    .order_by(AIReview.created_at.asc(), AIReview.id.asc())
                )
            ),
            "human_reviews": list(
                self.db.scalars(
                    select(HumanReview)
                    .where(HumanReview.submission_id == submission.id)
                    .order_by(HumanReview.created_at.asc(), HumanReview.id.asc())
                )
            ),
        }

    def _ensure_can_export_submission(self, submission: Submission, actor: ActorContext) -> None:
        self._ensure_can_export_task(submission.task, actor)

    def _ensure_can_export_task(self, task: Task, actor: ActorContext) -> None:
        if actor.role == UserRole.REVIEWER:
            return
        if actor.role == UserRole.OWNER and task.created_by == actor.user_id:
            return
        raise WorkflowError("PERMISSION_DENIED", "This role cannot export review audit data")


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
