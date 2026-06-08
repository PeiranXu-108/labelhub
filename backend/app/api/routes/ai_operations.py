from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.config import LLMProviderConfig
from app.agent.providers import ReviewModel
from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import AIReviewDecision, SubmissionStatus, UserRole
from app.models import AIReview, AuditLog, ReviewConfig, Submission, Task
from app.schemas.ai_operations import (
    AIOperationReviewConfigRead,
    AIOperationReviewRead,
    AIOperationRetryResponse,
    AIOperationRunDetailRead,
    AIOperationRunListItemRead,
    AIOperationRunStatus,
    AIOperationVerdictRead,
)
from app.services.agent_workflow import AgentWorkflowService
from app.services.ai_review import AIReviewService
from app.services.review_stages import current_review_stage
from app.services.workflow import ActorContext, WorkflowError

router = APIRouter(prefix="/ai-operations", tags=["ai-operations"])


def get_ai_review_model() -> ReviewModel | None:
    return None


def get_ai_review_provider_config() -> LLMProviderConfig | None:
    return None


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_workflow_error(exc: WorkflowError) -> None:
    status_code = status.HTTP_404_NOT_FOUND if exc.code.endswith("_NOT_FOUND") else status.HTTP_400_BAD_REQUEST
    if exc.code == "PERMISSION_DENIED":
        status_code = status.HTTP_403_FORBIDDEN
    raise api_error(exc.code, exc.message, status_code)


@router.get("/runs", response_model=list[AIOperationRunListItemRead])
def list_ai_operation_runs(
    run_status: AIOperationRunStatus | None = None,
    task_id: str | None = None,
    ai_decision: AIReviewDecision | None = None,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> list[AIOperationRunListItemRead]:
    submissions = _operation_submissions(db, actor=actor, task_id=task_id)
    rows = [_list_item(db, submission) for submission in submissions]
    if run_status is not None:
        rows = [row for row in rows if row.run_status == run_status]
    if ai_decision is not None:
        rows = [row for row in rows if row.ai_decision == ai_decision]
    return rows


@router.get("/runs/{submission_id}", response_model=AIOperationRunDetailRead)
def get_ai_operation_run(
    submission_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> AIOperationRunDetailRead:
    submission = _get_permitted_submission(db, submission_id, actor)
    return _detail(db, submission)


@router.post("/runs/{submission_id}/retry", response_model=AIOperationRetryResponse)
def retry_ai_operation_run(
    submission_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
    model: ReviewModel | None = Depends(get_ai_review_model),
    provider_config: LLMProviderConfig | None = Depends(get_ai_review_provider_config),
) -> AIOperationRetryResponse:
    submission = _get_permitted_submission(db, submission_id, actor)
    try:
        _review, retry_performed = AIReviewService(
            db,
            model=model,
            provider_config=provider_config,
        ).retry_failed_submission(submission.id, _actor_context(actor))
    except WorkflowError as exc:
        _raise_workflow_error(exc)
    except ValueError as exc:
        if str(exc) == "FAILED_AI_REVIEW_NOT_FOUND":
            raise api_error(
                "FAILED_AI_REVIEW_NOT_FOUND",
                "Only failed AI review runs can be retried",
                status.HTTP_409_CONFLICT,
            ) from exc
        raise
    db.commit()
    db.refresh(submission)
    return AIOperationRetryResponse(
        retry_performed=retry_performed,
        detail=_detail(db, submission),
    )


def _operation_submissions(
    db: Session,
    *,
    actor: Actor,
    task_id: str | None = None,
) -> list[Submission]:
    query = select(Submission).join(Task).where(Submission.submitted_at.is_not(None))
    if actor.role == UserRole.OWNER:
        query = query.where(Task.created_by == actor.user_id)
    if task_id:
        query = query.where(Submission.task_id == task_id)
    return list(db.scalars(query.order_by(Submission.updated_at.desc(), Submission.id.desc())))


def _get_permitted_submission(db: Session, submission_id: str, actor: Actor) -> Submission:
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise api_error("SUBMISSION_NOT_FOUND", "Submission was not found", status.HTTP_404_NOT_FOUND)
    if actor.role == UserRole.OWNER and submission.task.created_by != actor.user_id:
        raise api_error(
            "PERMISSION_DENIED",
            "This role is not allowed to perform the requested action",
            status.HTTP_403_FORBIDDEN,
        )
    return submission


def _detail(db: Session, submission: Submission) -> AIOperationRunDetailRead:
    ai_reviews = _ai_reviews(db, submission.id)
    latest_review = _latest_ai_review(db, submission.id)
    review_config = _review_config(db, submission)
    audit_logs = _audit_logs(db, submission.id)
    latest_payload = latest_review.structured_response if latest_review else {}
    return AIOperationRunDetailRead(
        **_list_item(db, submission, latest_review=latest_review).model_dump(),
        submission=submission,
        task=submission.task,
        item=submission.item,
        template_schema=submission.template_schema,
        review_config=_review_config_read(review_config),
        agent_workflow=AgentWorkflowService(db).workflow_for_submission(submission),
        latest_ai_review=_review_read(db, latest_review, submission) if latest_review else None,
        ai_reviews=[_review_read(db, review, submission) for review in ai_reviews],
        audit_logs=audit_logs,
        processing_logs=_processing_logs(audit_logs),
        item_payload=submission.item.payload,
        answer_payload=submission.answer_payload,
        score_dimensions=list(latest_payload.get("criterion_scores") or []),
        verdict=AIOperationVerdictRead(
            decision=latest_review.decision if latest_review else None,
            summary=latest_payload.get("summary"),
            return_reasons=list(latest_payload.get("return_reasons") or []),
            suggestions=list(latest_payload.get("suggestions") or []),
        ),
    )


def _list_item(
    db: Session,
    submission: Submission,
    *,
    latest_review: AIReview | None = None,
) -> AIOperationRunListItemRead:
    latest = latest_review if latest_review is not None else _latest_ai_review(db, submission.id)
    idempotency_key = _idempotency_key(submission)
    return AIOperationRunListItemRead(
        submission_id=submission.id,
        task_id=submission.task_id,
        task_name=submission.task.name,
        labeler_id=submission.labeler_id,
        attempt=submission.attempt,
        run_status=_run_status(submission, latest),
        workflow_status=SubmissionStatus(submission.status).value,
        current_stage=current_review_stage(submission),
        ai_decision=latest.decision if latest else None,
        overall_score=latest.overall_score if latest else None,
        model_name=latest.model_name if latest else None,
        retry_count=_retry_count(latest),
        operator_retry_count=_operator_retry_count(db, submission.id, idempotency_key),
        idempotency_key=idempotency_key,
        latest_ai_review_id=latest.id if latest else None,
        latest_ai_review_status=latest.status if latest else None,
        submitted_at=submission.submitted_at,
        last_run_at=latest.created_at if latest else None,
        updated_at=submission.updated_at,
    )


def _review_config(db: Session, submission: Submission) -> ReviewConfig:
    config = db.scalar(select(ReviewConfig).where(ReviewConfig.task_id == submission.task_id))
    if config is None:
        config = ReviewConfig(task_id=submission.task_id)
        db.add(config)
        db.flush()
    return config


def _review_config_read(config: ReviewConfig) -> AIOperationReviewConfigRead:
    return AIOperationReviewConfigRead(
        id=config.id,
        task_id=config.task_id,
        prompt_template=config.prompt_template,
        criteria=config.criteria,
        pass_threshold=config.pass_threshold,
        return_threshold=config.return_threshold,
        manual_review_threshold=config.manual_review_threshold,
        model_name=config.model_name,
        temperature=config.temperature,
        max_retries=config.max_retries,
    )


def _review_read(
    db: Session,
    review: AIReview,
    submission: Submission,
) -> AIOperationReviewRead:
    idempotency_key = _idempotency_key(submission)
    return AIOperationReviewRead(
        id=review.id,
        submission_id=review.submission_id,
        decision=review.decision,
        overall_score=review.overall_score,
        status=review.status,
        structured_response=review.structured_response,
        prompt_snapshot=review.prompt_snapshot,
        model_name=review.model_name,
        raw_provider_response=review.raw_provider_response,
        error_metadata=review.error_metadata,
        retry_count=_retry_count(review),
        idempotency_key=_review_idempotency_key(review) or idempotency_key,
        created_at=review.created_at,
    )


def _latest_ai_review(db: Session, submission_id: str) -> AIReview | None:
    return db.scalar(
        select(AIReview)
        .where(AIReview.submission_id == submission_id, AIReview.status != "superseded")
        .order_by(AIReview.created_at.desc(), AIReview.id.desc())
        .limit(1)
    )


def _ai_reviews(db: Session, submission_id: str) -> list[AIReview]:
    return list(
        db.scalars(
            select(AIReview)
            .where(AIReview.submission_id == submission_id)
            .order_by(AIReview.created_at.desc(), AIReview.id.desc())
        )
    )


def _audit_logs(db: Session, submission_id: str) -> list[AuditLog]:
    return list(
        db.scalars(
            select(AuditLog)
            .where(AuditLog.entity_type == "submission", AuditLog.entity_id == submission_id)
            .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
        )
    )


def _processing_logs(audit_logs: list[AuditLog]) -> list[AuditLog]:
    processing_actions = {
        "submit",
        "start_ai_review",
        "retry_ai_review",
        "ai_pass",
        "ai_return",
        "require_human_review",
    }
    return [log for log in audit_logs if log.action in processing_actions]


def _run_status(
    submission: Submission,
    latest_review: AIReview | None,
) -> AIOperationRunStatus:
    current_status = SubmissionStatus(submission.status)
    if latest_review is not None and latest_review.status == "failed":
        return AIOperationRunStatus.FAILED
    if current_status == SubmissionStatus.AI_REVIEWING:
        return AIOperationRunStatus.RUNNING
    if latest_review is None:
        return AIOperationRunStatus.PENDING
    if latest_review.decision == AIReviewDecision.PASS:
        return AIOperationRunStatus.PASSED
    if latest_review.decision == AIReviewDecision.RETURN:
        return AIOperationRunStatus.RETURNED
    return AIOperationRunStatus.HUMAN_REVIEW


def _retry_count(review: AIReview | None) -> int:
    if review is None:
        return 0
    raw_count = (review.error_metadata or {}).get("retry_count", 0)
    return raw_count if isinstance(raw_count, int) else 0


def _operator_retry_count(db: Session, submission_id: str, idempotency_key: str) -> int:
    return sum(
        1
        for review in _ai_reviews(db, submission_id)
        if review.status == "superseded" and _review_idempotency_key(review) == idempotency_key
    )


def _review_idempotency_key(review: AIReview) -> str | None:
    for payload in (review.structured_response or {}, review.error_metadata or {}):
        key = payload.get("idempotency_key")
        if isinstance(key, str):
            return key
    return None


def _idempotency_key(submission: Submission) -> str:
    return f"{submission.id}:{submission.attempt}"
