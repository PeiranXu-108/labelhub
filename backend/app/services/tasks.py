from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AuditLog, ReviewConfig, Task, TaskItem
from app.services.dataset_import import (
    ExcelMapping,
    ImportValidationError,
    preview_import_source,
    validate_items_for_commit,
)
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

    def update_task(self, task_id: str, actor: ActorContext, data: dict[str, Any]) -> Task:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        for key, value in data.items():
            setattr(task, key, value)
        self.db.add(task)
        self._audit("task", task.id, "update", actor, metadata={"fields": list(data.keys())})
        self.db.commit()
        self.db.refresh(task)
        return task

    def import_items(self, task_id: str, actor: ActorContext, items: list[dict[str, Any]]) -> list[TaskItem]:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        settings = get_settings()
        external_ids = {
            external_id.strip()
            for item in items
            if isinstance((external_id := item.get("external_id")), str) and external_id.strip()
        }
        existing_external_ids = self._existing_external_ids(task_id, external_ids)
        try:
            normalized_items = validate_items_for_commit(
                items,
                existing_external_ids=existing_external_ids,
                max_rows=settings.import_max_rows,
            )
        except ImportValidationError as exc:
            raise WorkflowError(
                "INVALID_ITEM_IMPORT",
                str(exc),
                details={"errors": [issue.to_dict() for issue in exc.issues]},
            ) from exc

        created = [
            TaskItem(task_id=task_id, external_id=item.get("external_id"), payload=item["payload"])
            for item in normalized_items
        ]
        self.db.add_all(created)
        self.db.flush()
        self._audit("task", task_id, "import_items", actor, metadata={"count": len(created)})
        self.db.commit()
        return created

    def preview_import(self, task_id: str, data: dict[str, Any]) -> dict[str, Any]:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        settings = get_settings()
        existing_external_ids = set(
            self.db.scalars(
                select(TaskItem.external_id).where(
                    TaskItem.task_id == task_id,
                    TaskItem.external_id.is_not(None),
                )
            )
        )
        mapping_data = data["excel_mapping"]
        preview = preview_import_source(
            import_format=data["format"],
            content=data["content"],
            is_base64=data.get("is_base64", False),
            excel_mapping=ExcelMapping(
                external_id_column=mapping_data.get("external_id_column", "external_id"),
                payload_column=mapping_data.get("payload_column"),
                payload_columns=mapping_data.get("payload_columns"),
            ),
            max_rows=settings.import_max_rows,
            max_file_bytes=settings.import_max_file_bytes,
            existing_external_ids=existing_external_ids,
        )
        return preview.to_dict()

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

    def _existing_external_ids(self, task_id: str, external_ids: set[str]) -> set[str]:
        if not external_ids:
            return set()
        return set(
            self.db.scalars(
                select(TaskItem.external_id).where(
                    TaskItem.task_id == task_id,
                    TaskItem.external_id.in_(external_ids),
                )
            )
        )
