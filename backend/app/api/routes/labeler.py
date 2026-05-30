from fastapi import APIRouter, Depends, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import TaskStatus, UserRole
from app.models import Assignment, HumanReview, Submission, Task, TaskItem, TemplateSchema
from app.schemas.agent_workflow import AgentWorkflowRead
from app.schemas.labeler import AssignmentDetailRead, ClaimRead
from app.schemas.submission import DraftSaveRequest, SubmissionRead, SubmitRequest
from app.schemas.task import TaskRead
from app.services.submissions import SubmissionService
from app.services.agent_workflow import AgentWorkflowService
from app.services.workflow import ActorContext, WorkflowError

router = APIRouter(prefix="/labeler", tags=["labeler"])


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_workflow_error(exc: WorkflowError) -> None:
    status_code = status.HTTP_404_NOT_FOUND if exc.code.endswith("_NOT_FOUND") or exc.code == "NO_AVAILABLE_ITEMS" else status.HTTP_400_BAD_REQUEST
    if exc.code == "PERMISSION_DENIED":
        status_code = status.HTTP_403_FORBIDDEN
    raise api_error(exc.code, exc.message, status_code)


@router.get("/tasks", response_model=list[TaskRead])
def marketplace(
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> list[Task]:
    has_unassigned_item = (
        select(TaskItem.id)
        .where(
            TaskItem.task_id == Task.id,
            ~exists().where(Assignment.item_id == TaskItem.id),
        )
        .exists()
    )
    has_published_template = (
        select(TemplateSchema.id)
        .where(
            TemplateSchema.task_id == Task.id,
            TemplateSchema.is_published.is_(True),
        )
        .exists()
    )
    return list(
        db.scalars(
            select(Task).where(
                Task.status == TaskStatus.PUBLISHED,
                has_unassigned_item,
                has_published_template,
            )
        )
    )


@router.post("/tasks/{task_id}/claim", response_model=ClaimRead, status_code=201)
def claim_task_item(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> Assignment:
    try:
        assignment = SubmissionService(db).claim_next_item(task_id, _actor_context(actor))
        return db.scalar(
            select(Assignment)
            .options(joinedload(Assignment.item), joinedload(Assignment.submission))
            .where(Assignment.id == assignment.id)
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.get("/assignments/{assignment_id}", response_model=AssignmentDetailRead)
def get_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> dict:
    try:
        assignment = SubmissionService(db).get_owned_assignment(assignment_id, _actor_context(actor))
        submission = assignment.submission
        template_schema = db.get(TemplateSchema, submission.template_schema_id)
        latest_human_review = db.scalar(
            select(HumanReview)
            .where(HumanReview.submission_id == submission.id)
            .order_by(HumanReview.created_at.desc(), HumanReview.id.desc())
            .limit(1)
        )
        return {
            "id": assignment.id,
            "task_id": assignment.task_id,
            "item_id": assignment.item_id,
            "labeler_id": assignment.labeler_id,
            "status": assignment.status,
            "claimed_at": assignment.claimed_at,
            "expires_at": assignment.expires_at,
            "item": assignment.item,
            "submission": submission,
            "task": db.get(Task, assignment.task_id),
            "template_schema": template_schema,
            "latest_human_review": latest_human_review,
        }
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.get("/assignments/{assignment_id}/agent-workflow", response_model=AgentWorkflowRead)
def get_assignment_agent_workflow(
    assignment_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> AgentWorkflowRead:
    try:
        assignment = SubmissionService(db).get_owned_assignment(assignment_id, _actor_context(actor))
        return AgentWorkflowService(db).workflow_for_submission(assignment.submission)
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.put("/assignments/{assignment_id}/draft", response_model=SubmissionRead)
def save_draft(
    assignment_id: str,
    payload: DraftSaveRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> Submission:
    try:
        return SubmissionService(db).save_draft(
            assignment_id,
            _actor_context(actor),
            payload.answer_payload,
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/assignments/{assignment_id}/submit", response_model=SubmissionRead)
def submit_assignment(
    assignment_id: str,
    payload: SubmitRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> Submission:
    try:
        return SubmissionService(db).submit_assignment(
            assignment_id,
            _actor_context(actor),
            payload.answer_payload,
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.get("/submissions", response_model=list[SubmissionRead])
def list_own_submissions(
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> list[Submission]:
    return list(
        db.scalars(
            select(Submission)
            .where(Submission.labeler_id == actor.user_id)
            .order_by(Submission.created_at.desc())
        )
    )
