from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, ReviewConfig, Task, TaskItem
from app.services.workflow import ActorContext, WorkflowError


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_task(self, actor: ActorContext, data: dict[str, Any]) -> Task:
        task = Task(created_by=actor.user_id, **data)
        self.db.add(task)
        self.db.flush()
        self._audit("task", task.id, "create", actor)
        self.db.commit()
        self.db.refresh(task)
        return task

    def import_items(self, task_id: str, actor: ActorContext, items: list[dict[str, Any]]) -> list[TaskItem]:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        created = [
            TaskItem(task_id=task_id, external_id=item.get("external_id"), payload=item["payload"])
            for item in items
        ]
        self.db.add_all(created)
        self.db.flush()
        self._audit("task", task_id, "import_items", actor, metadata={"count": len(created)})
        self.db.commit()
        return created

    def upsert_review_config(
        self, task_id: str, actor: ActorContext, data: dict[str, Any]
    ) -> ReviewConfig:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        config = self.db.scalar(select(ReviewConfig).where(ReviewConfig.task_id == task_id))
        if config is None:
            config = ReviewConfig(task_id=task_id, **data)
            self.db.add(config)
            action = "create_review_config"
        else:
            for key, value in data.items():
                setattr(config, key, value)
            action = "update_review_config"
        self.db.flush()
        self._audit("task", task_id, action, actor)
        self.db.commit()
        self.db.refresh(config)
        return config

    def _audit(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        actor: ActorContext,
        from_status: str | None = None,
        to_status: str | None = None,
        metadata: dict[str, Any] | None = None,
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
                details=metadata or {},
            )
        )
        self.db.flush()
