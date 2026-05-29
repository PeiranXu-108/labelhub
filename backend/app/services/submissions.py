import logging
from threading import Thread
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, joinedload

from app.domain.enums import SubmissionAction, SubmissionStatus, TaskStatus
from app.models import (
    Assignment,
    AuditLog,
    HumanReview,
    Submission,
    SubmissionAttempt,
    Task,
    TaskItem,
    TemplateSchema,
)
from app.schemas.template import SubmissionValidationError
from app.services.templates import TemplateService
from app.services.workflow import ActorContext, WorkflowError, WorkflowService
from app.workers.ai_review import run_ai_review_task


logger = logging.getLogger(__name__)


class SubmissionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.workflow = WorkflowService(db)

    def claim_next_item(self, task_id: str, actor: ActorContext) -> Assignment:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        if task.status != TaskStatus.PUBLISHED:
            raise WorkflowError("TASK_NOT_PUBLISHED", "Only published tasks can be claimed")

        item = self.db.scalar(
            select(TaskItem)
            .where(
                TaskItem.task_id == task_id,
                ~exists().where(Assignment.item_id == TaskItem.id),
            )
            .order_by(TaskItem.created_at, TaskItem.id)
            .limit(1)
        )
        if item is None:
            raise WorkflowError("NO_AVAILABLE_ITEMS", "No unassigned items are available")

        schema = self.db.scalar(
            select(TemplateSchema)
            .where(TemplateSchema.task_id == task_id, TemplateSchema.is_published.is_(True))
            .order_by(TemplateSchema.version.desc())
        )
        if schema is None:
            raise WorkflowError("TEMPLATE_REQUIRED", "Task must have a published template")

        assignment = Assignment(task_id=task_id, item_id=item.id, labeler_id=actor.user_id)
        submission = Submission(
            task_id=task_id,
            item_id=item.id,
            assignment=assignment,
            labeler_id=actor.user_id,
            template_schema_id=schema.id,
            schema_version=schema.version,
            answer_payload={},
            status=SubmissionStatus.DRAFT,
        )
        item.status = "assigned"
        self.db.add_all([assignment, submission])
        self.db.flush()
        self._audit("assignment", assignment.id, "claim", actor)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def get_owned_assignment(self, assignment_id: str, actor: ActorContext) -> Assignment:
        assignment = self.db.scalar(
            select(Assignment)
            .options(
                joinedload(Assignment.item),
                joinedload(Assignment.submission),
            )
            .where(Assignment.id == assignment_id)
        )
        if assignment is None:
            raise WorkflowError("ASSIGNMENT_NOT_FOUND", "Assignment was not found")
        if assignment.labeler_id != actor.user_id:
            raise WorkflowError("PERMISSION_DENIED", "Labeler does not own this assignment")
        return assignment

    def save_draft(
        self, assignment_id: str, actor: ActorContext, answer_payload: dict[str, Any]
    ) -> Submission:
        assignment = self.get_owned_assignment(assignment_id, actor)
        submission = assignment.submission
        if submission.status == SubmissionStatus.RETURNED:
            submission = self.workflow.transition_submission(
                submission.id, SubmissionAction.REOPEN, actor
            )
        if submission.status != SubmissionStatus.DRAFT:
            raise WorkflowError("INVALID_TRANSITION", "Only draft submissions can be edited")
        try:
            TemplateService(self.db).validate_submission_payload(
                submission.template_schema,
                answer_payload,
                require_required=False,
            )
        except SubmissionValidationError as exc:
            raise WorkflowError("INVALID_SUBMISSION_PAYLOAD", str(exc)) from exc
        submission.answer_payload = answer_payload
        self._audit("submission", submission.id, "save_draft", actor)
        self.db.commit()
        self.db.refresh(submission)
        return submission

    def submit_assignment(
        self, assignment_id: str, actor: ActorContext, answer_payload: dict[str, Any]
    ) -> Submission:
        assignment = self.get_owned_assignment(assignment_id, actor)
        submission = assignment.submission
        try:
            TemplateService(self.db).validate_submission_payload(
                submission.template_schema,
                answer_payload,
                require_required=True,
            )
        except SubmissionValidationError as exc:
            raise WorkflowError("INVALID_SUBMISSION_PAYLOAD", str(exc)) from exc
        submission.answer_payload = answer_payload
        submission = self.workflow.transition_submission(
            submission.id, SubmissionAction.SUBMIT, actor
        )
        if submission.submitted_at is None:
            raise WorkflowError("SUBMISSION_TIMESTAMP_MISSING", "Submitted submission has no timestamp")
        self.db.add(
            SubmissionAttempt(
                submission_id=submission.id,
                attempt=submission.attempt,
                template_schema_id=submission.template_schema_id,
                schema_version=submission.schema_version,
                answer_payload=answer_payload,
                submitted_at=submission.submitted_at,
            )
        )
        assignment.status = "submitted"
        self.db.commit()
        self.db.refresh(submission)
        try:
            enqueue_ai_review(submission.id)
        except Exception:
            logger.exception("Failed to enqueue AI review for submission %s", submission.id)
        return submission

    def approve(self, submission_id: str, actor: ActorContext) -> Submission:
        submission = self._start_human_review_if_needed(submission_id, actor)
        submission = self.workflow.transition_submission(
            submission.id, SubmissionAction.APPROVE, actor
        )
        self.db.add(
            HumanReview(
                submission_id=submission.id,
                reviewer_id=actor.user_id,
                decision="approve",
                reason=None,
            )
        )
        self.db.commit()
        self.db.refresh(submission)
        return submission

    def return_submission(self, submission_id: str, actor: ActorContext, reason: str) -> Submission:
        submission = self._start_human_review_if_needed(submission_id, actor)
        submission = self.workflow.transition_submission(
            submission.id, SubmissionAction.RETURN, actor, reason=reason
        )
        self.db.add(
            HumanReview(
                submission_id=submission.id,
                reviewer_id=actor.user_id,
                decision="return",
                reason=reason,
            )
        )
        self.db.commit()
        self.db.refresh(submission)
        return submission

    def _start_human_review_if_needed(self, submission_id: str, actor: ActorContext) -> Submission:
        submission = self.db.get(Submission, submission_id)
        if submission is None:
            raise WorkflowError("SUBMISSION_NOT_FOUND", "Submission was not found")
        if submission.status in {
            SubmissionStatus.AI_PASSED,
            SubmissionStatus.NEEDS_HUMAN_REVIEW,
        }:
            return self.workflow.transition_submission(
                submission.id, SubmissionAction.START_HUMAN_REVIEW, actor
            )
        return submission

    def _audit(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        actor: ActorContext,
        from_status: str | None = None,
        to_status: str | None = None,
    ) -> None:
        self.db.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                actor_id=actor.user_id,
                actor_role=actor.role.value,
                from_status=from_status,
                to_status=to_status,
                details={},
            )
        )
        self.db.flush()


def enqueue_ai_review(submission_id: str) -> None:
    Thread(target=_publish_ai_review_task, args=(submission_id,), daemon=True).start()


def _publish_ai_review_task(submission_id: str) -> None:
    try:
        run_ai_review_task.delay(submission_id)
    except Exception:
        logger.exception("Failed to enqueue AI review for submission %s", submission_id)
