from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import SubmissionStatus, UserRole
from app.models import Submission
from app.schemas.review import BatchReviewRequest, ReviewActionRequest, ReviewSubmissionDetail
from app.schemas.submission import SubmissionRead
from app.services.submissions import SubmissionService
from app.services.workflow import ActorContext, WorkflowError

router = APIRouter(prefix="/review", tags=["review"])


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_workflow_error(exc: WorkflowError) -> None:
    status_code = status.HTTP_404_NOT_FOUND if exc.code.endswith("_NOT_FOUND") else status.HTTP_400_BAD_REQUEST
    if exc.code == "PERMISSION_DENIED":
        status_code = status.HTTP_403_FORBIDDEN
    raise api_error(exc.code, exc.message, status_code)


@router.get("/queue", response_model=list[SubmissionRead])
def review_queue(
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> list[Submission]:
    return list(
        db.scalars(
            select(Submission)
            .where(
                Submission.status.in_(
                    [
                        SubmissionStatus.AI_PASSED,
                        SubmissionStatus.NEEDS_HUMAN_REVIEW,
                        SubmissionStatus.HUMAN_REVIEWING,
                    ]
                )
            )
            .order_by(Submission.updated_at.desc())
        )
    )


@router.get("/submissions/{submission_id}", response_model=ReviewSubmissionDetail)
def get_submission_detail(
    submission_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> dict:
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise api_error("SUBMISSION_NOT_FOUND", "Submission was not found", status.HTTP_404_NOT_FOUND)
    return {"submission": submission, "task": submission.task, "item": submission.item}


@router.post("/submissions/{submission_id}/approve", response_model=SubmissionRead)
def approve_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> Submission:
    try:
        return SubmissionService(db).approve(submission_id, _actor_context(actor))
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/submissions/{submission_id}/return", response_model=SubmissionRead)
def return_submission(
    submission_id: str,
    payload: ReviewActionRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.REVIEWER)),
) -> Submission:
    try:
        return SubmissionService(db).return_submission(
            submission_id,
            _actor_context(actor),
            payload.reason,
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
                updated.append(service.approve(submission_id, _actor_context(actor)))
            else:
                updated.append(
                    service.return_submission(
                        submission_id,
                        _actor_context(actor),
                        payload.reason or "",
                    )
                )
        except WorkflowError as exc:
            _raise_workflow_error(exc)
    return updated
