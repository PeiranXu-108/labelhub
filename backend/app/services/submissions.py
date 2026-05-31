import logging
from threading import Thread
from typing import Any

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session, joinedload

from app.domain.enums import ReviewStage, SubmissionAction, SubmissionStatus, TaskStatus
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
from app.services.review_stages import (
    comparison_attempts,
    current_review_stage,
    validate_review_action_stage,
)
from app.workers.ai_review import run_ai_review_task


logger = logging.getLogger(__name__)


class SubmissionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.workflow = WorkflowService(db)

    def claim_next_item(self, task_id: str, actor: ActorContext) -> Assignment:
        assignment = self._claim_next_available_item(task_id, actor, empty_is_error=True)
        if assignment is None:
            raise WorkflowError("NO_AVAILABLE_ITEMS", "No unassigned items are available")
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
        self._ensure_assignment_not_skipped(assignment)
        submission = assignment.submission
        if submission.status == SubmissionStatus.RETURNED:
            submission = self.workflow.transition_submission(
                submission.id, SubmissionAction.REOPEN, actor
            )
        if submission.status != SubmissionStatus.DRAFT:
            raise WorkflowError("INVALID_TRANSITION", "Only draft submissions can be edited")
        try:
            normalized_payload = TemplateService(self.db).validate_submission_payload(
                submission.template_schema,
                answer_payload,
                require_required=False,
                submission=submission,
            )
        except SubmissionValidationError as exc:
            raise WorkflowError("INVALID_SUBMISSION_PAYLOAD", str(exc)) from exc
        submission.answer_payload = normalized_payload
        self._audit("submission", submission.id, "save_draft", actor)
        self.db.commit()
        self.db.refresh(submission)
        return submission

    def navigation_state(self, assignment_id: str, actor: ActorContext) -> dict[str, Any]:
        assignment = self.get_owned_assignment(assignment_id, actor)
        previous_assignment = self._owned_neighbor_assignment(assignment, actor, direction="previous")
        next_assignment = self._owned_neighbor_assignment(assignment, actor, direction="next")
        can_claim_next = next_assignment is None and self._next_claimable_item(assignment) is not None
        return {
            "assignment_id": assignment.id,
            "task_id": assignment.task_id,
            "previous_assignment_id": previous_assignment.id if previous_assignment else None,
            "next_assignment_id": next_assignment.id if next_assignment else None,
            "can_claim_next": can_claim_next,
            "has_previous": previous_assignment is not None,
            "has_next": next_assignment is not None or can_claim_next,
            "no_work_left": next_assignment is None and not can_claim_next,
        }

    def previous_assignment(self, assignment_id: str, actor: ActorContext) -> Assignment | None:
        assignment = self.get_owned_assignment(assignment_id, actor)
        return self._owned_neighbor_assignment(assignment, actor, direction="previous")

    def next_assignment(self, assignment_id: str, actor: ActorContext) -> Assignment | None:
        assignment = self.get_owned_assignment(assignment_id, actor)
        target = self._owned_neighbor_assignment(assignment, actor, direction="next")
        if target is not None:
            return target

        target = self._claim_next_available_item(
            assignment.task_id,
            actor,
            after_item=assignment.item,
            empty_is_error=False,
        )
        if target is None:
            return None
        self.db.commit()
        self.db.refresh(target)
        return target

    def skip_assignment(
        self, assignment_id: str, actor: ActorContext, reason: str | None = None
    ) -> Assignment | None:
        assignment = self.get_owned_assignment(assignment_id, actor)
        if assignment.status == "skipped":
            raise WorkflowError("ASSIGNMENT_ALREADY_SKIPPED", "Assignment has already been skipped")
        if assignment.submission.status != SubmissionStatus.DRAFT:
            raise WorkflowError("INVALID_TRANSITION", "Only draft assignments can be skipped")

        previous_status = assignment.status
        normalized_reason = reason.strip() if reason else None
        assignment.status = "skipped"
        assignment.item.status = "skipped"
        self.db.flush()

        target = self._owned_neighbor_assignment(assignment, actor, direction="next")
        if target is None:
            target = self._claim_next_available_item(
                assignment.task_id,
                actor,
                after_item=assignment.item,
                empty_is_error=False,
            )

        self._audit(
            "assignment",
            assignment.id,
            "skip",
            actor,
            from_status=previous_status,
            to_status="skipped",
            reason=normalized_reason,
            details={
                "task_id": assignment.task_id,
                "item_id": assignment.item_id,
                "submission_id": assignment.submission.id,
                "next_assignment_id": target.id if target else None,
            },
        )
        self.db.commit()
        if target is not None:
            self.db.refresh(target)
        return target

    def submit_assignment(
        self, assignment_id: str, actor: ActorContext, answer_payload: dict[str, Any]
    ) -> Submission:
        assignment = self.get_owned_assignment(assignment_id, actor)
        self._ensure_assignment_not_skipped(assignment)
        submission = assignment.submission
        try:
            normalized_payload = TemplateService(self.db).validate_submission_payload(
                submission.template_schema,
                answer_payload,
                require_required=True,
                submission=submission,
            )
        except SubmissionValidationError as exc:
            raise WorkflowError("INVALID_SUBMISSION_PAYLOAD", str(exc)) from exc
        submission.answer_payload = normalized_payload
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
                answer_payload=normalized_payload,
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

    def approve(
        self,
        submission_id: str,
        actor: ActorContext,
        stage: ReviewStage | None = None,
    ) -> Submission:
        submission = self._review_submission(submission_id)
        try:
            decision_stage = validate_review_action_stage(
                submission,
                decision="approve",
                requested_stage=stage,
            )
        except ValueError as exc:
            raise WorkflowError("INVALID_REVIEW_STAGE", str(exc)) from exc

        from_stage = current_review_stage(submission)
        submission = self._start_human_review_if_needed(submission.id, actor, from_stage)
        compared_from_attempt, compared_to_attempt = comparison_attempts(self.db, submission)
        metadata = {
            "review_stage": decision_stage.value,
            "from_review_stage": from_stage.value if from_stage else None,
            "round": submission.attempt,
            "compared_from_attempt": compared_from_attempt,
            "compared_to_attempt": compared_to_attempt,
        }
        submission = self.workflow.transition_submission(
            submission.id,
            SubmissionAction.APPROVE,
            actor,
            metadata=metadata,
        )
        self.db.add(
            HumanReview(
                submission_id=submission.id,
                reviewer_id=actor.user_id,
                decision="approve",
                stage=decision_stage,
                round=submission.attempt,
                compared_from_attempt=compared_from_attempt,
                compared_to_attempt=compared_to_attempt,
                reason=None,
                review_metadata=metadata,
            )
        )
        self.db.commit()
        self.db.refresh(submission)
        return submission

    def return_submission(
        self,
        submission_id: str,
        actor: ActorContext,
        reason: str,
        stage: ReviewStage | None = None,
    ) -> Submission:
        submission = self._review_submission(submission_id)
        try:
            decision_stage = validate_review_action_stage(
                submission,
                decision="return",
                requested_stage=stage,
            )
        except ValueError as exc:
            raise WorkflowError("INVALID_REVIEW_STAGE", str(exc)) from exc

        submission = self._start_human_review_if_needed(submission.id, actor, decision_stage)
        compared_from_attempt, compared_to_attempt = comparison_attempts(self.db, submission)
        metadata = {
            "review_stage": decision_stage.value,
            "round": submission.attempt,
            "compared_from_attempt": compared_from_attempt,
            "compared_to_attempt": compared_to_attempt,
        }
        submission = self.workflow.transition_submission(
            submission.id,
            SubmissionAction.RETURN,
            actor,
            reason=reason,
            metadata=metadata,
        )
        self.db.add(
            HumanReview(
                submission_id=submission.id,
                reviewer_id=actor.user_id,
                decision="return",
                stage=decision_stage,
                round=submission.attempt,
                compared_from_attempt=compared_from_attempt,
                compared_to_attempt=compared_to_attempt,
                reason=reason,
                review_metadata=metadata,
            )
        )
        self.db.commit()
        self.db.refresh(submission)
        return submission

    def _review_submission(self, submission_id: str) -> Submission:
        submission = self.db.get(Submission, submission_id)
        if submission is None:
            raise WorkflowError("SUBMISSION_NOT_FOUND", "Submission was not found")
        return submission

    def _start_human_review_if_needed(
        self,
        submission_id: str,
        actor: ActorContext,
        stage: ReviewStage | None,
    ) -> Submission:
        submission = self._review_submission(submission_id)
        if submission.status in {
            SubmissionStatus.AI_PASSED,
            SubmissionStatus.NEEDS_HUMAN_REVIEW,
        }:
            metadata = {
                "review_stage": (stage or current_review_stage(submission) or ReviewStage.INITIAL_REVIEW).value,
                "round": submission.attempt,
            }
            return self.workflow.transition_submission(
                submission.id,
                SubmissionAction.START_HUMAN_REVIEW,
                actor,
                metadata=metadata,
            )
        return submission

    def _ensure_assignment_not_skipped(self, assignment: Assignment) -> None:
        if assignment.status == "skipped":
            raise WorkflowError("INVALID_TRANSITION", "Skipped assignments cannot be edited or submitted")

    def _audit(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        actor: ActorContext,
        from_status: str | None = None,
        to_status: str | None = None,
        reason: str | None = None,
        details: dict[str, Any] | None = None,
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
                reason=reason,
                details=details or {},
            )
        )
        self.db.flush()

    def _claim_next_available_item(
        self,
        task_id: str,
        actor: ActorContext,
        *,
        after_item: TaskItem | None = None,
        empty_is_error: bool,
    ) -> Assignment | None:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        if task.status != TaskStatus.PUBLISHED:
            raise WorkflowError("TASK_NOT_PUBLISHED", "Only published tasks can be claimed")

        schema = self.db.scalar(
            select(TemplateSchema)
            .where(TemplateSchema.task_id == task_id, TemplateSchema.is_published.is_(True))
            .order_by(TemplateSchema.version.desc())
        )
        if schema is None:
            raise WorkflowError("TEMPLATE_REQUIRED", "Task must have a published template")

        item = self._next_claimable_item_for_task(task_id, after_item=after_item)
        if item is None:
            if empty_is_error:
                raise WorkflowError("NO_AVAILABLE_ITEMS", "No unassigned items are available")
            return None

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
        return assignment

    def _owned_neighbor_assignment(
        self,
        assignment: Assignment,
        actor: ActorContext,
        *,
        direction: str,
    ) -> Assignment | None:
        if direction == "previous":
            position_filter = self._item_before_filter(assignment.item)
            ordering = (TaskItem.created_at.desc(), TaskItem.id.desc())
        else:
            position_filter = self._item_after_filter(assignment.item)
            ordering = (TaskItem.created_at.asc(), TaskItem.id.asc())
        return self.db.scalar(
            select(Assignment)
            .join(Assignment.item)
            .options(
                joinedload(Assignment.item),
                joinedload(Assignment.submission),
            )
            .where(
                Assignment.task_id == assignment.task_id,
                Assignment.labeler_id == actor.user_id,
                Assignment.id != assignment.id,
                Assignment.status != "skipped",
                position_filter,
            )
            .order_by(*ordering)
            .limit(1)
        )

    def _next_claimable_item(self, assignment: Assignment) -> TaskItem | None:
        task = self.db.get(Task, assignment.task_id)
        if task is None or task.status != TaskStatus.PUBLISHED:
            return None
        has_schema = self.db.scalar(
            select(
                exists().where(
                    TemplateSchema.task_id == assignment.task_id,
                    TemplateSchema.is_published.is_(True),
                )
            )
        )
        if not has_schema:
            return None
        return self._next_claimable_item_for_task(assignment.task_id, after_item=assignment.item)

    def _next_claimable_item_for_task(
        self, task_id: str, *, after_item: TaskItem | None = None
    ) -> TaskItem | None:
        filters = [
            TaskItem.task_id == task_id,
            ~exists().where(Assignment.item_id == TaskItem.id),
        ]
        if after_item is not None:
            filters.append(self._item_after_filter(after_item))
        return self.db.scalar(
            select(TaskItem)
            .where(*filters)
            .order_by(TaskItem.created_at.asc(), TaskItem.id.asc())
            .limit(1)
        )

    def _item_before_filter(self, item: TaskItem):
        return or_(
            TaskItem.created_at < item.created_at,
            and_(TaskItem.created_at == item.created_at, TaskItem.id < item.id),
        )

    def _item_after_filter(self, item: TaskItem):
        return or_(
            TaskItem.created_at > item.created_at,
            and_(TaskItem.created_at == item.created_at, TaskItem.id > item.id),
        )


def enqueue_ai_review(submission_id: str) -> None:
    Thread(target=_publish_ai_review_task, args=(submission_id,), daemon=True).start()


def _publish_ai_review_task(submission_id: str) -> None:
    try:
        run_ai_review_task.delay(submission_id)
    except Exception:
        logger.exception("Failed to enqueue AI review for submission %s", submission_id)
