from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models import TemplateSchema
from app.schemas.template import TemplateDraftRequest, TemplateSchemaRead
from app.services.templates import TemplateService
from app.services.workflow import ActorContext, WorkflowError

router = APIRouter(prefix="/tasks", tags=["templates"])


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_workflow_error(exc: WorkflowError) -> None:
    if exc.code == "PERMISSION_DENIED":
        status_code = status.HTTP_403_FORBIDDEN
    else:
        status_code = status.HTTP_404_NOT_FOUND if exc.code.endswith("_NOT_FOUND") else status.HTTP_400_BAD_REQUEST
    raise api_error(exc.code, exc.message, status_code)


@router.get("/{task_id}/template", response_model=TemplateSchemaRead)
def get_template(
    task_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER, UserRole.LABELER)),
) -> TemplateSchema:
    try:
        return TemplateService(db).get_latest(task_id)
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post(
    "/{task_id}/template/draft",
    response_model=TemplateSchemaRead,
    status_code=status.HTTP_201_CREATED,
)
def save_template_draft(
    task_id: str,
    payload: TemplateDraftRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> TemplateSchema:
    try:
        return TemplateService(db).save_draft(task_id, _actor_context(actor), payload.template_schema)
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/{task_id}/template/publish", response_model=TemplateSchemaRead)
def publish_template(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> TemplateSchema:
    try:
        return TemplateService(db).publish_draft(task_id, _actor_context(actor))
    except WorkflowError as exc:
        _raise_workflow_error(exc)
