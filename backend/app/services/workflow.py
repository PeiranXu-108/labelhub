from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.domain.enums import (
    ReviewStage,
    SubmissionAction,
    SubmissionStatus,
    TaskAction,
    TaskStatus,
    UserRole,
)
from app.models import Assignment, AuditLog, Submission, Task, TaskItem, TemplateSchema


class WorkflowError(Exception):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass(frozen=True)
class ActorContext:
    user_id: str
    role: UserRole


class WorkflowService:
    TRANSITIONS: dict[tuple[SubmissionStatus, SubmissionAction], SubmissionStatus] = {
        (SubmissionStatus.DRAFT, SubmissionAction.SUBMIT): SubmissionStatus.SUBMITTED,
        (SubmissionStatus.SUBMITTED, SubmissionAction.START_AI_REVIEW): SubmissionStatus.AI_REVIEWING,
        (
            SubmissionStatus.NEEDS_HUMAN_REVIEW,
            SubmissionAction.RETRY_AI_REVIEW,
        ): SubmissionStatus.AI_REVIEWING,
        (SubmissionStatus.AI_REVIEWING, SubmissionAction.AI_PASS): SubmissionStatus.AI_PASSED,
        (SubmissionStatus.AI_REVIEWING, SubmissionAction.AI_RETURN): SubmissionStatus.AI_RETURNED,
        (
            SubmissionStatus.AI_REVIEWING,
            SubmissionAction.REQUIRE_HUMAN_REVIEW,
        ): SubmissionStatus.NEEDS_HUMAN_REVIEW,
        (SubmissionStatus.AI_PASSED, SubmissionAction.START_HUMAN_REVIEW): SubmissionStatus.HUMAN_REVIEWING,
        (
            SubmissionStatus.NEEDS_HUMAN_REVIEW,
            SubmissionAction.START_HUMAN_REVIEW,
        ): SubmissionStatus.HUMAN_REVIEWING,
        (SubmissionStatus.HUMAN_REVIEWING, SubmissionAction.APPROVE): SubmissionStatus.APPROVED,
        (SubmissionStatus.HUMAN_REVIEWING, SubmissionAction.RETURN): SubmissionStatus.RETURNED,
        (SubmissionStatus.APPROVED, SubmissionAction.MARK_EXPORTABLE): SubmissionStatus.EXPORTABLE,
        (SubmissionStatus.RETURNED, SubmissionAction.REOPEN): SubmissionStatus.DRAFT,
    }

    ROLE_ACTIONS: dict[SubmissionAction, set[UserRole]] = {
        SubmissionAction.SUBMIT: {UserRole.LABELER},
        SubmissionAction.START_AI_REVIEW: {UserRole.AI_AGENT},
        SubmissionAction.RETRY_AI_REVIEW: {UserRole.OWNER, UserRole.REVIEWER},
        SubmissionAction.AI_PASS: {UserRole.AI_AGENT},
        SubmissionAction.AI_RETURN: {UserRole.AI_AGENT},
        SubmissionAction.REQUIRE_HUMAN_REVIEW: {UserRole.AI_AGENT, UserRole.REVIEWER},
        SubmissionAction.START_HUMAN_REVIEW: {UserRole.REVIEWER},
        SubmissionAction.APPROVE: {UserRole.REVIEWER},
        SubmissionAction.RETURN: {UserRole.REVIEWER},
        SubmissionAction.MARK_EXPORTABLE: {UserRole.OWNER},
        SubmissionAction.REOPEN: {UserRole.LABELER},
    }

    TASK_TRANSITIONS: dict[tuple[TaskStatus, TaskAction], TaskStatus] = {
        (TaskStatus.DRAFT, TaskAction.PUBLISH): TaskStatus.PUBLISHED,
        (TaskStatus.PUBLISHED, TaskAction.PAUSE): TaskStatus.PAUSED,
        (TaskStatus.PAUSED, TaskAction.PUBLISH): TaskStatus.PUBLISHED,
        (TaskStatus.PUBLISHED, TaskAction.END): TaskStatus.ENDED,
        (TaskStatus.PAUSED, TaskAction.END): TaskStatus.ENDED,
    }

    def __init__(self, db: Session) -> None:
        self.db = db

    def transition_submission(
        self,
        submission_id: str,
        action: SubmissionAction,
        actor: ActorContext,
        reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Submission:
        submission = self.db.get(Submission, submission_id)
        if submission is None:
            raise WorkflowError("SUBMISSION_NOT_FOUND", "Submission was not found")

        allowed_roles = self.ROLE_ACTIONS[action]
        if actor.role not in allowed_roles:
            raise WorkflowError("PERMISSION_DENIED", "Actor role cannot perform this transition")

        current_status = SubmissionStatus(submission.status)
        next_status = self.TRANSITIONS.get((current_status, action))
        if next_status is None:
            raise WorkflowError(
                "INVALID_TRANSITION",
                f"Cannot apply {action.value} to submission in {current_status.value}",
            )

        if action == SubmissionAction.RETURN and not reason:
            raise WorkflowError("REASON_REQUIRED", "Return transitions require a reason")

        transition_metadata = metadata or {}
        review_stage = transition_metadata.get("review_stage")
        if review_stage is not None:
            submission.review_stage = ReviewStage(review_stage)

        submission.status = next_status
        if action == SubmissionAction.SUBMIT:
            submission.submitted_at = datetime.now(UTC)
        if action == SubmissionAction.REOPEN:
            submission.attempt += 1
            if review_stage is None:
                submission.review_stage = ReviewStage.RE_REVIEW

        self.db.add(
            AuditLog(
                entity_type="submission",
                entity_id=submission.id,
                action=action.value,
                actor_id=actor.user_id,
                actor_role=actor.role.value,
                from_status=current_status.value,
                to_status=next_status.value,
                reason=reason,
                details=transition_metadata,
            )
        )
        self.db.flush()
        return submission

    def transition_task(
        self,
        task_id: str,
        action: TaskAction,
        actor: ActorContext,
        reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Task:
        if actor.role != UserRole.OWNER:
            raise WorkflowError("PERMISSION_DENIED", "Only owners can change task status")

        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        current_status = TaskStatus(task.status)
        next_status = self.TASK_TRANSITIONS.get((current_status, action))
        if next_status is None:
            raise WorkflowError(
                "INVALID_TASK_TRANSITION",
                f"Cannot apply {action.value} to task in {current_status.value}",
            )
        if action == TaskAction.PUBLISH:
            self._ensure_task_publishable(task.id)

        task.status = next_status
        self.db.add(
            AuditLog(
                entity_type="task",
                entity_id=task.id,
                action=action.value,
                actor_id=actor.user_id,
                actor_role=actor.role.value,
                from_status=current_status.value,
                to_status=next_status.value,
                reason=reason,
                details=metadata or {},
            )
        )
        self.db.flush()
        return task

    def _ensure_task_publishable(self, task_id: str) -> None:
        has_unassigned_item = self.db.scalar(
            select(
                exists().where(
                    TaskItem.task_id == task_id,
                    ~exists().where(Assignment.item_id == TaskItem.id),
                )
            )
        )
        if not has_unassigned_item:
            raise WorkflowError(
                "TASK_ITEMS_REQUIRED",
                "Task must have at least one unassigned item before publishing",
            )

        has_published_template = self.db.scalar(
            select(
                exists().where(
                    TemplateSchema.task_id == task_id,
                    TemplateSchema.is_published.is_(True),
                )
            )
        )
        if not has_published_template:
            raise WorkflowError("TEMPLATE_REQUIRED", "Task must have a published template")
