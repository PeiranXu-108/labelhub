from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.domain.enums import AIReviewDecision, SubmissionStatus, TaskStatus
from app.models import AIReview, AuditLog, ReviewConfig, Submission, Task, TaskItem
from app.services.dataset_import import (
    ExcelMapping,
    ImportValidationError,
    preview_import_source,
    validate_items_for_commit,
)
from app.services.workflow import ActorContext, WorkflowError

PROGRESS_SUBMISSION_STATUSES = {
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.AI_REVIEWING,
    SubmissionStatus.AI_PASSED,
    SubmissionStatus.NEEDS_HUMAN_REVIEW,
    SubmissionStatus.HUMAN_REVIEWING,
    SubmissionStatus.APPROVED,
    SubmissionStatus.EXPORTABLE,
}


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

    def list_tasks(
        self,
        *,
        search: str | None = None,
        status: str | None = None,
        distribution_strategy: str | None = None,
    ) -> list[Task]:
        return list(
            self.db.scalars(
                self._filtered_tasks_query(
                    search=search,
                    status=status,
                    distribution_strategy=distribution_strategy,
                ).order_by(Task.created_at.desc(), Task.id.desc())
            )
        )

    def task_list_metrics(
        self,
        *,
        search: str | None = None,
        status: str | None = None,
        distribution_strategy: str | None = None,
    ) -> dict[str, Any]:
        tasks = list(
            self.db.scalars(
                self._filtered_tasks_query(
                    search=search,
                    status=status,
                    distribution_strategy=distribution_strategy,
                ).order_by(Task.created_at.desc(), Task.id.desc())
            )
        )
        task_metrics = self._task_metrics_for(tasks)
        progress_values = [metric["progress_percent"] for metric in task_metrics]
        return {
            "summary": {
                "total_task_count": len(tasks),
                "published_task_count": sum(1 for task in tasks if TaskStatus(task.status) == TaskStatus.PUBLISHED),
                "draft_task_count": sum(1 for task in tasks if TaskStatus(task.status) == TaskStatus.DRAFT),
                "item_count": sum(metric["item_count"] for metric in task_metrics),
                "submitted_count": sum(metric["submitted_count"] for metric in task_metrics),
                "current_week_submitted_count": sum(
                    metric["current_week_submitted_count"] for metric in task_metrics
                ),
                "average_progress_percent": round(sum(progress_values) / len(progress_values)) if progress_values else 0,
            },
            "task_metrics": task_metrics,
        }

    def task_metrics(self, task_id: str) -> dict[str, Any]:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        return self._task_metrics_for([task])[0]

    def update_task(self, task_id: str, actor: ActorContext, data: dict[str, Any]) -> Task:
        task = self._get_owned_task(task_id, actor)
        for key, value in data.items():
            setattr(task, key, value)
        self.db.add(task)
        self._audit("task", task.id, "update", actor, metadata={"fields": list(data.keys())})
        self.db.commit()
        self.db.refresh(task)
        return task

    def import_items(self, task_id: str, actor: ActorContext, items: list[dict[str, Any]]) -> list[TaskItem]:
        self._get_owned_task(task_id, actor)

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

    def preview_import(self, task_id: str, actor: ActorContext, data: dict[str, Any]) -> dict[str, Any]:
        self._get_owned_task(task_id, actor)

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
        self._get_owned_task(task_id, actor)

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

    def _get_owned_task(self, task_id: str, actor: ActorContext) -> Task:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        if task.created_by != actor.user_id:
            raise WorkflowError("PERMISSION_DENIED", "Only the task owner can modify this task")
        return task

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

    def _filtered_tasks_query(
        self,
        *,
        search: str | None,
        status: str | None,
        distribution_strategy: str | None,
    ):
        query = select(Task)
        normalized_search = search.strip() if search else ""
        if normalized_search:
            pattern = f"%{normalized_search}%"
            query = query.where(
                or_(
                    Task.id.ilike(pattern),
                    Task.name.ilike(pattern),
                    Task.description.ilike(pattern),
                    Task.instruction_plain_text.ilike(pattern),
                    cast(Task.tags, String).ilike(pattern),
                )
            )
        if status:
            query = query.where(Task.status == status)
        if distribution_strategy:
            query = query.where(Task.distribution_strategy == distribution_strategy)
        return query

    def _task_metrics_for(self, tasks: list[Task]) -> list[dict[str, Any]]:
        task_ids = [task.id for task in tasks]
        if not task_ids:
            return []

        item_counts = {
            task_id: count
            for task_id, count in self.db.execute(
                select(TaskItem.task_id, func.count(TaskItem.id))
                .where(TaskItem.task_id.in_(task_ids))
                .group_by(TaskItem.task_id)
            )
        }
        submissions = list(
            self.db.scalars(
                select(Submission)
                .where(Submission.task_id.in_(task_ids))
                .order_by(Submission.created_at.asc(), Submission.id.asc())
            )
        )
        submission_counts: dict[str, Counter[str]] = {task_id: Counter() for task_id in task_ids}
        submitted_counts: Counter[str] = Counter()
        current_week_counts: Counter[str] = Counter()
        week_start = self._current_week_start()
        for submission in submissions:
            task_id = submission.task_id
            current_status = SubmissionStatus(submission.status)
            submission_counts[task_id][current_status.value] += 1
            if current_status not in PROGRESS_SUBMISSION_STATUSES or submission.submitted_at is None:
                continue
            submitted_counts[task_id] += 1
            if self._coerce_utc(submission.submitted_at) >= week_start:
                current_week_counts[task_id] += 1

        ai_decision_counts: dict[str, Counter[str]] = {task_id: Counter() for task_id in task_ids}
        seen_submission_ids: set[str] = set()
        for review, task_id, submission_id in self.db.execute(
            select(AIReview, Submission.task_id, Submission.id)
            .join(Submission, AIReview.submission_id == Submission.id)
            .where(Submission.task_id.in_(task_ids))
            .order_by(AIReview.created_at.desc(), AIReview.id.desc())
        ):
            if submission_id in seen_submission_ids:
                continue
            seen_submission_ids.add(submission_id)
            ai_decision_counts[task_id][AIReviewDecision(review.decision).value] += 1

        metrics: list[dict[str, Any]] = []
        for task in tasks:
            item_count = item_counts.get(task.id, 0)
            submitted_count = submitted_counts[task.id]
            metrics.append(
                {
                    "task_id": task.id,
                    "item_count": item_count,
                    "submitted_count": submitted_count,
                    "current_week_submitted_count": current_week_counts[task.id],
                    "progress_percent": round((submitted_count / item_count) * 100) if item_count else 0,
                    "submission_status_counts": dict(submission_counts[task.id]),
                    "ai_decision_counts": dict(ai_decision_counts[task.id]),
                }
            )
        return metrics

    def _current_week_start(self) -> datetime:
        now = datetime.now(UTC)
        return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    def _coerce_utc(self, value: datetime) -> datetime:
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
