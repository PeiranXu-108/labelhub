from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import AIReviewDecision, ReviewStage, SubmissionStatus, UserRole
from app.models import AIReview, AuditLog, HumanReview, Submission, SubmissionAttempt
from app.schemas.review import (
    BatchReviewRequest,
    ReviewActionRequest,
    ReviewQueueItemRead,
    ReviewSubmissionDetail,
)
from app.schemas.submission import SubmissionRead
from app.services.submissions import SubmissionService
from app.services.agent_workflow import AgentWorkflowService
from app.services.review_stages import build_round_diffs, current_review_stage
from app.services.workflow import ActorContext, WorkflowError

router = APIRouter(prefix="/review", tags=["review"])


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_workflow_error(exc: WorkflowError) -> None:
    status_code = status.HTTP_404_NOT_FOUND if exc.code.endswith("_NOT_FOUND") else status.HTTP_400_BAD_REQUEST
    if exc.code == "PERMISSION_DENIED":
        status_code = status.HTTP_403_FORBIDDEN
    raise api_error(exc.code, exc.message, status_code)


@router.get("/queue", response_model=list[ReviewQueueItemRead])
def review_queue(
    task_id: str | None = None,
    status_filter: SubmissionStatus | None = Query(default=None, alias="status"),
    ai_decision: AIReviewDecision | None = None,
    min_score: int | None = Query(default=None, ge=0, le=100),
    max_score: int | None = Query(default=None, ge=0, le=100),
    review_stage: ReviewStage | None = None,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> list[dict]:
    query = select(Submission)
    if task_id:
        query = query.where(Submission.task_id == task_id)
    if status_filter is not None:
        query = query.where(Submission.status == status_filter)
    else:
        query = query.where(
            Submission.status.in_(
                [
                    SubmissionStatus.AI_PASSED,
                    SubmissionStatus.NEEDS_HUMAN_REVIEW,
                    SubmissionStatus.HUMAN_REVIEWING,
                ]
            )
        )
    submissions = list(db.scalars(query.order_by(Submission.updated_at.desc())))

    items: list[dict] = []
    for submission in submissions:
        current_stage = current_review_stage(submission)
        if review_stage is not None and current_stage != review_stage:
            continue
        latest_ai_review = _latest_ai_review(db, submission.id)
        if ai_decision is not None and (
            latest_ai_review is None or latest_ai_review.decision != ai_decision
        ):
            continue
        if min_score is not None and (
            latest_ai_review is None or latest_ai_review.overall_score < min_score
        ):
            continue
        if max_score is not None and (
            latest_ai_review is None or latest_ai_review.overall_score > max_score
        ):
            continue
        items.append(
            {
                "submission": submission,
                "task": submission.task,
                "current_stage": current_stage,
                "latest_ai_review": latest_ai_review,
                "latest_human_review": _latest_human_review(db, submission.id),
            }
        )
    return items


@router.get("/submissions/{submission_id}", response_model=ReviewSubmissionDetail)
def get_submission_detail(
    submission_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> dict:
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise api_error("SUBMISSION_NOT_FOUND", "Submission was not found", status.HTTP_404_NOT_FOUND)
    ai_reviews = list(
        db.scalars(
            select(AIReview)
            .where(AIReview.submission_id == submission.id)
            .order_by(AIReview.created_at.desc(), AIReview.id.desc())
        )
    )
    human_reviews = list(
        db.scalars(
            select(HumanReview)
            .where(HumanReview.submission_id == submission.id)
            .order_by(HumanReview.round.asc(), HumanReview.created_at.asc(), HumanReview.id.asc())
        )
    )
    audit_logs = list(
        db.scalars(
            select(AuditLog)
            .where(AuditLog.entity_type == "submission", AuditLog.entity_id == submission.id)
            .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
        )
    )
    previous_attempts = list(
        db.scalars(
            select(SubmissionAttempt)
            .where(
                SubmissionAttempt.submission_id == submission.id,
                SubmissionAttempt.attempt < submission.attempt,
            )
            .order_by(SubmissionAttempt.attempt.asc(), SubmissionAttempt.created_at.asc())
        )
    )
    all_attempts = list(
        db.scalars(
            select(SubmissionAttempt)
            .where(
                SubmissionAttempt.submission_id == submission.id,
                SubmissionAttempt.attempt <= submission.attempt,
            )
            .order_by(SubmissionAttempt.attempt.asc(), SubmissionAttempt.created_at.asc())
        )
    )
    return {
        "submission": submission,
        "task": submission.task,
        "item": submission.item,
        "template_schema": submission.template_schema,
        "agent_workflow": AgentWorkflowService(db).workflow_for_submission(submission),
        "current_stage": current_review_stage(submission),
        "ai_reviews": ai_reviews,
        "human_reviews": human_reviews,
        "stage_history": human_reviews,
        "round_diffs": build_round_diffs(
            all_attempts,
            schema_payload=submission.template_schema.schema_payload,
        ),
        "audit_logs": audit_logs,
        "previous_attempts": previous_attempts,
    }


@router.post("/submissions/{submission_id}/approve", response_model=SubmissionRead)
def approve_submission(
    submission_id: str,
    payload: ReviewActionRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> Submission:
    try:
        return SubmissionService(db).approve(
            submission_id,
            _actor_context(actor),
            stage=payload.stage if payload else None,
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/submissions/{submission_id}/return", response_model=SubmissionRead)
def return_submission(
    submission_id: str,
    payload: ReviewActionRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> Submission:
    if payload.reason is None:
        raise api_error("REASON_REQUIRED", "Return requires a reason", status.HTTP_400_BAD_REQUEST)
    try:
        return SubmissionService(db).return_submission(
            submission_id,
            _actor_context(actor),
            payload.reason,
            stage=payload.stage,
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/submissions/batch", response_model=list[SubmissionRead])
def batch_review(
    payload: BatchReviewRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> list[Submission]:
    if payload.action == "return" and not payload.reason:
        raise api_error("REASON_REQUIRED", "Batch return requires a reason")

    service = SubmissionService(db)
    updated: list[Submission] = []
    for submission_id in payload.submission_ids:
        try:
            if payload.action == "approve":
                updated.append(
                    service.approve(
                        submission_id,
                        _actor_context(actor),
                        stage=payload.stage,
                    )
                )
            else:
                updated.append(
                    service.return_submission(
                        submission_id,
                        _actor_context(actor),
                        payload.reason or "",
                        stage=payload.stage,
                    )
                )
        except WorkflowError as exc:
            _raise_workflow_error(exc)
    return updated


def _latest_ai_review(db: Session, submission_id: str) -> AIReview | None:
    return db.scalar(
        select(AIReview)
        .where(AIReview.submission_id == submission_id)
        .order_by(AIReview.created_at.desc(), AIReview.id.desc())
        .limit(1)
    )


def _latest_human_review(db: Session, submission_id: str) -> HumanReview | None:
    return db.scalar(
        select(HumanReview)
        .where(HumanReview.submission_id == submission_id)
        .order_by(HumanReview.round.desc(), HumanReview.created_at.desc(), HumanReview.id.desc())
        .limit(1)
    )
