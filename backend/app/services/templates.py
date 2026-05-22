from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Task, TemplateSchema
from app.schemas.template import (
    CheckboxGroupField,
    JsonField,
    LlmTriggerField,
    NumberField,
    OptionField,
    RatingField,
    ShowItemField,
    SubmissionValidationError,
    TemplateDocument,
    TextField,
)
from app.services.workflow import ActorContext, WorkflowError


class TemplateService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest(self, task_id: str) -> TemplateSchema:
        schema = self.db.scalar(
            select(TemplateSchema)
            .where(TemplateSchema.task_id == task_id)
            .order_by(TemplateSchema.version.desc(), TemplateSchema.created_at.desc())
            .limit(1)
        )
        if schema is None:
            raise WorkflowError("TEMPLATE_NOT_FOUND", "Template schema was not found")
        return schema

    def save_draft(
        self, task_id: str, actor: ActorContext, schema_document: TemplateDocument
    ) -> TemplateSchema:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        latest_published = self._latest_published(task_id)
        latest_draft = self._latest_draft(task_id)
        next_version = (latest_published.version if latest_published else 0) + 1

        if latest_draft is not None and latest_draft.version >= next_version:
            draft = latest_draft
        else:
            draft = TemplateSchema(
                task_id=task_id,
                version=next_version,
                title=schema_document.title,
                schema_payload={},
                is_published=False,
                created_by=actor.user_id,
            )
            self.db.add(draft)

        if draft.is_published:
            raise WorkflowError("SCHEMA_VERSION_LOCKED", "Published template schemas cannot be modified")

        draft.title = schema_document.title
        draft.schema_payload = self._payload_for_version(schema_document, draft.version)
        self.db.flush()
        self._audit(
            "template_schema",
            draft.id,
            "save_draft",
            actor,
            details={"task_id": task_id, "version": draft.version},
        )
        self.db.commit()
        self.db.refresh(draft)
        return draft

    def publish_draft(self, task_id: str, actor: ActorContext) -> TemplateSchema:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")

        draft = self._latest_draft(task_id)
        if draft is None:
            raise WorkflowError("TEMPLATE_DRAFT_REQUIRED", "Save a template draft before publishing")
        if draft.is_published:
            raise WorkflowError("SCHEMA_VERSION_LOCKED", "Published template schemas cannot be modified")

        TemplateDocument.model_validate(draft.schema_payload)
        draft.is_published = True
        draft.published_at = datetime.now(UTC)
        self.db.flush()
        self._audit(
            "template_schema",
            draft.id,
            "publish",
            actor,
            details={"task_id": task_id, "version": draft.version},
        )
        self.db.commit()
        self.db.refresh(draft)
        return draft

    def validate_submission_payload(
        self,
        template_schema: TemplateSchema,
        answer_payload: dict[str, Any],
        *,
        require_required: bool,
    ) -> None:
        schema = TemplateDocument.model_validate(template_schema.schema_payload)
        issues: list[str] = []
        answerable_fields = [
            field for field in schema.fields if not isinstance(field, (ShowItemField, LlmTriggerField))
        ]
        answerable_ids = {field.id for field in answerable_fields}

        for answer_id in answer_payload:
            if answer_id not in answerable_ids:
                issues.append(f"Unknown field '{answer_id}'")

        for field in answerable_fields:
            value_present = field.id in answer_payload
            value = answer_payload.get(field.id)
            if require_required and field.required and self._is_empty(value):
                issues.append(f"Required field '{field.id}' is missing")
                continue
            if value_present and not self._is_empty(value):
                issues.extend(self._validate_field_answer(field, value))

        if issues:
            raise SubmissionValidationError(issues)

    def _validate_field_answer(self, field: Any, value: Any) -> list[str]:
        if isinstance(field, TextField):
            if not isinstance(value, str):
                return [f"Field '{field.id}' must be a string"]
            issues: list[str] = []
            if field.min_length is not None and len(value) < field.min_length:
                issues.append(f"Field '{field.id}' must be at least {field.min_length} characters")
            if field.max_length is not None and len(value) > field.max_length:
                issues.append(f"Field '{field.id}' must be at most {field.max_length} characters")
            return issues
        if isinstance(field, NumberField):
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                return [f"Field '{field.id}' must be a number"]
            issues = []
            if field.min_value is not None and value < field.min_value:
                issues.append(f"Field '{field.id}' must be greater than or equal to {field.min_value}")
            if field.max_value is not None and value > field.max_value:
                issues.append(f"Field '{field.id}' must be less than or equal to {field.max_value}")
            return issues
        if isinstance(field, OptionField):
            allowed_values = {option.value for option in field.options}
            if isinstance(field, CheckboxGroupField):
                if not isinstance(value, list):
                    return [f"Field '{field.id}' must be a list"]
                invalid_values = [entry for entry in value if entry not in allowed_values]
                if invalid_values:
                    return [f"Field '{field.id}' contains unsupported options: {invalid_values}"]
                return []
            if value not in allowed_values:
                return [f"Field '{field.id}' must be one of {sorted(allowed_values)}"]
            return []
        if isinstance(field, RatingField):
            if not isinstance(value, int) or isinstance(value, bool):
                return [f"Field '{field.id}' must be an integer rating"]
            if value < field.min_value or value > field.max_value:
                return [f"Field '{field.id}' must be between {field.min_value} and {field.max_value}"]
            return []
        if isinstance(field, JsonField):
            if not isinstance(value, (dict, list)):
                return [f"Field '{field.id}' must be a JSON object or array"]
            return []
        return []

    def _latest_published(self, task_id: str) -> TemplateSchema | None:
        return self.db.scalar(
            select(TemplateSchema)
            .where(TemplateSchema.task_id == task_id, TemplateSchema.is_published.is_(True))
            .order_by(TemplateSchema.version.desc())
            .limit(1)
        )

    def _latest_draft(self, task_id: str) -> TemplateSchema | None:
        return self.db.scalar(
            select(TemplateSchema)
            .where(TemplateSchema.task_id == task_id, TemplateSchema.is_published.is_(False))
            .order_by(TemplateSchema.version.desc())
            .limit(1)
        )

    def _payload_for_version(self, schema_document: TemplateDocument, version: int) -> dict[str, Any]:
        payload = schema_document.model_copy(update={"version": version})
        return payload.model_dump(by_alias=True, mode="json")

    def _is_empty(self, value: Any) -> bool:
        return value is None or value == "" or value == []

    def _audit(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        actor: ActorContext,
        *,
        details: dict[str, Any],
    ) -> None:
        self.db.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                actor_id=actor.user_id,
                actor_role=actor.role.value,
                details=details,
            )
        )
        self.db.flush()
