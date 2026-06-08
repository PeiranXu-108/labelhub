from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import TaskAction, TaskStatus, UserRole
from app.models import ReviewConfig, Task, TaskItem
from app.schemas.agent_workflow import TaskAgentWorkflowSummaryRead
from app.schemas.task import (
    ItemImportRequest,
    ItemImportPreviewRequest,
    ItemImportPreviewResponse,
    ReviewConfigRead,
    ReviewConfigUpsert,
    TaskCreate,
    TaskItemRead,
    TaskListMetricsRead,
    TaskMetricRead,
    TaskRead,
    TaskUpdate,
)
from app.services.tasks import TaskService
from app.services.agent_workflow import AgentWorkflowService
from app.services.workflow import ActorContext, WorkflowError, WorkflowService

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_workflow_error(exc: WorkflowError) -> None:
    status_code = status.HTTP_404_NOT_FOUND if exc.code.endswith("_NOT_FOUND") else status.HTTP_400_BAD_REQUEST
    raise api_error(exc.code, exc.message, status_code, extra=exc.details)


@router.get("", response_model=list[TaskRead])
def list_tasks(
    search: str | None = None,
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    distribution_strategy: Literal["manual", "auto_claim"] | None = None,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> list[Task]:
    return TaskService(db).list_tasks(
        search=search,
        status=task_status.value if task_status else None,
        distribution_strategy=distribution_strategy,
    )


@router.get("/metrics", response_model=TaskListMetricsRead)
def get_task_list_metrics(
    search: str | None = None,
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    distribution_strategy: Literal["manual", "auto_claim"] | None = None,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> dict:
    return TaskService(db).task_list_metrics(
        search=search,
        status=task_status.value if task_status else None,
        distribution_strategy=distribution_strategy,
    )


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> Task:
    return TaskService(db).create_task(_actor_context(actor), payload.to_task_data())


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER, UserRole.LABELER)),
) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise api_error("TASK_NOT_FOUND", "Task was not found", status.HTTP_404_NOT_FOUND)
    return task


@router.get("/{task_id}/metrics", response_model=TaskMetricRead)
def get_task_metrics(
    task_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> dict:
    try:
        return TaskService(db).task_metrics(task_id)
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.get("/{task_id}/agent-workflow", response_model=TaskAgentWorkflowSummaryRead)
def get_task_agent_workflow(
    task_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> TaskAgentWorkflowSummaryRead:
    task = db.get(Task, task_id)
    if task is None:
        raise api_error("TASK_NOT_FOUND", "Task was not found", status.HTTP_404_NOT_FOUND)
    return AgentWorkflowService(db).task_summary(task)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> Task:
    try:
        return TaskService(db).update_task(task_id, _actor_context(actor), payload.to_update_data())
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/{task_id}/publish", response_model=TaskRead)
def publish_task(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> Task:
    try:
        task = WorkflowService(db).transition_task(task_id, TaskAction.PUBLISH, _actor_context(actor))
        db.commit()
        db.refresh(task)
        return task
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/{task_id}/pause", response_model=TaskRead)
def pause_task(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> Task:
    try:
        task = WorkflowService(db).transition_task(task_id, TaskAction.PAUSE, _actor_context(actor))
        db.commit()
        db.refresh(task)
        return task
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/{task_id}/end", response_model=TaskRead)
def end_task(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> Task:
    try:
        task = WorkflowService(db).transition_task(task_id, TaskAction.END, _actor_context(actor))
        db.commit()
        db.refresh(task)
        return task
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/{task_id}/items/import", response_model=list[TaskItemRead], status_code=201)
def import_items(
    task_id: str,
    payload: ItemImportRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> list[TaskItem]:
    try:
        return TaskService(db).import_items(
            task_id,
            _actor_context(actor),
            [item.model_dump() for item in payload.items],
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.post("/{task_id}/items/import/preview", response_model=ItemImportPreviewResponse)
def preview_import_items(
    task_id: str,
    payload: ItemImportPreviewRequest,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> dict:
    try:
        return TaskService(db).preview_import(task_id, payload.model_dump())
    except WorkflowError as exc:
        _raise_workflow_error(exc)


@router.get("/{task_id}/items", response_model=list[TaskItemRead])
def list_items(
    task_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> list[TaskItem]:
    return list(db.scalars(select(TaskItem).where(TaskItem.task_id == task_id)))


@router.get("/{task_id}/review-config", response_model=ReviewConfigRead)
def get_review_config(
    task_id: str,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> ReviewConfig:
    config = db.scalar(select(ReviewConfig).where(ReviewConfig.task_id == task_id))
    if config is None:
        raise api_error("REVIEW_CONFIG_NOT_FOUND", "Review config was not found", status.HTTP_404_NOT_FOUND)
    return config


@router.put("/{task_id}/review-config", response_model=ReviewConfigRead)
def put_review_config(
    task_id: str,
    payload: ReviewConfigUpsert,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> ReviewConfig:
    try:
        return TaskService(db).upsert_review_config(
            task_id,
            _actor_context(actor),
            payload.model_dump(),
        )
    except WorkflowError as exc:
        _raise_workflow_error(exc)
