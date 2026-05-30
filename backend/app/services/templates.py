from datetime import UTC, datetime
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Submission, Task, TemplateSchema, UploadAsset
from app.schemas.template import (
    CheckboxGroupField,
    FileUploadField,
    ImageUploadField,
    JsonField,
    LlmTriggerField,
    NumberField,
    OptionField,
    RatingField,
    RichTextField,
    ShowItemField,
    SubmissionValidationError,
    TemplateDocument,
    TextField,
)
from app.schemas.task import MARKDOWN_CONTROL_RE, UNSAFE_RICH_TEXT_PATTERNS, normalize_plain_text
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
        submission: Submission | None = None,
    ) -> dict[str, Any]:
        schema = TemplateDocument.model_validate(template_schema.schema_payload)
        issues: list[str] = []
        normalized_payload: dict[str, Any] = {}
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
            if not value_present:
                continue
            if self._is_empty(value):
                normalized_payload[field.id] = value
                continue
            field_issues, normalized_value = self._validate_field_answer(field, value, submission=submission)
            issues.extend(field_issues)
            if not field_issues:
                normalized_payload[field.id] = normalized_value

        if issues:
            raise SubmissionValidationError(issues)
        return normalized_payload

    def _validate_field_answer(
        self,
        field: Any,
        value: Any,
        *,
        submission: Submission | None,
    ) -> tuple[list[str], Any]:
        if isinstance(field, RichTextField):
            return self._validate_rich_text_answer(field, value)
        if isinstance(field, (ImageUploadField, FileUploadField)):
            return self._validate_upload_answer(field, value, submission)
        if isinstance(field, TextField):
            if not isinstance(value, str):
                return [f"Field '{field.id}' must be a string"], value
            issues: list[str] = []
            if field.min_length is not None and len(value) < field.min_length:
                issues.append(f"Field '{field.id}' must be at least {field.min_length} characters")
            if field.max_length is not None and len(value) > field.max_length:
                issues.append(f"Field '{field.id}' must be at most {field.max_length} characters")
            return issues, value
        if isinstance(field, NumberField):
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                return [f"Field '{field.id}' must be a number"], value
            issues = []
            if field.min_value is not None and value < field.min_value:
                issues.append(f"Field '{field.id}' must be greater than or equal to {field.min_value}")
            if field.max_value is not None and value > field.max_value:
                issues.append(f"Field '{field.id}' must be less than or equal to {field.max_value}")
            return issues, value
        if isinstance(field, OptionField):
            allowed_values = {option.value for option in field.options}
            if isinstance(field, CheckboxGroupField):
                if not isinstance(value, list):
                    return [f"Field '{field.id}' must be a list"], value
                invalid_values = [entry for entry in value if entry not in allowed_values]
                if invalid_values:
                    return [f"Field '{field.id}' contains unsupported options: {invalid_values}"], value
                return [], value
            if value not in allowed_values:
                return [f"Field '{field.id}' must be one of {sorted(allowed_values)}"], value
            return [], value
        if isinstance(field, RatingField):
            if not isinstance(value, int) or isinstance(value, bool):
                return [f"Field '{field.id}' must be an integer rating"], value
            if value < field.min_value or value > field.max_value:
                return [f"Field '{field.id}' must be between {field.min_value} and {field.max_value}"], value
            return [], value
        if isinstance(field, JsonField):
            if not isinstance(value, (dict, list)):
                return [f"Field '{field.id}' must be a JSON object or array"], value
            return [], value
        return [], value

    def _validate_rich_text_answer(self, field: RichTextField, value: Any) -> tuple[list[str], Any]:
        if not isinstance(value, dict):
            return [f"Field '{field.id}' must be a rich text object"], value
        if value.get("format") != "markdown":
            return [f"Field '{field.id}' rich text format must be markdown"], value
        content = value.get("content")
        if not isinstance(content, str):
            return [f"Field '{field.id}' rich text content must be a string"], value
        content = content.strip()
        if not content:
            return [f"Field '{field.id}' rich text content cannot be empty"], value
        if any(pattern.search(content) for pattern in UNSAFE_RICH_TEXT_PATTERNS):
            return [f"Field '{field.id}' rich text contains unsafe markup"], value
        plain_text = _plain_text_from_markdown(content)
        if not plain_text:
            return [f"Field '{field.id}' rich text plainText cannot be empty"], value
        issues: list[str] = []
        if field.min_length is not None and len(plain_text) < field.min_length:
            issues.append(f"Field '{field.id}' must be at least {field.min_length} plain-text characters")
        if field.max_length is not None and len(plain_text) > field.max_length:
            issues.append(f"Field '{field.id}' must be at most {field.max_length} plain-text characters")
        return issues, {"format": "markdown", "content": content, "plainText": plain_text}

    def _validate_upload_answer(
        self,
        field: ImageUploadField | FileUploadField,
        value: Any,
        submission: Submission | None,
    ) -> tuple[list[str], Any]:
        if not isinstance(value, list):
            return [f"Field '{field.id}' must be a list of uploaded assets"], value
        issues: list[str] = []
        if len(value) > field.max_count:
            issues.append(f"Field '{field.id}' cannot contain more than {field.max_count} uploaded assets")
        normalized_assets: list[dict[str, Any]] = []
        for index, entry in enumerate(value):
            if not isinstance(entry, dict) or not isinstance(entry.get("assetId"), str):
                issues.append(f"Field '{field.id}' upload entry {index + 1} must include assetId")
                continue
            if submission is None:
                issues.append(f"Field '{field.id}' upload validation requires submission context")
                continue
            asset = self.db.get(UploadAsset, entry["assetId"])
            if asset is None:
                issues.append(f"Field '{field.id}' upload asset '{entry['assetId']}' was not found")
                continue
            asset_issues = self._validate_upload_asset(field, asset, submission)
            issues.extend(asset_issues)
            if asset_issues:
                continue
            asset.submission_id = submission.id
            normalized_assets.append(_upload_asset_answer(asset))
        return issues, normalized_assets

    def _validate_upload_asset(
        self,
        field: ImageUploadField | FileUploadField,
        asset: UploadAsset,
        submission: Submission,
    ) -> list[str]:
        issues: list[str] = []
        if asset.task_id != submission.task_id or asset.assignment_id != submission.assignment_id:
            issues.append(f"Upload asset '{asset.id}' does not belong to this submission")
        if asset.uploader_id != submission.labeler_id:
            issues.append(f"Upload asset '{asset.id}' was not uploaded by this labeler")
        if asset.field_id != field.id:
            issues.append(f"Upload asset '{asset.id}' does not belong to field '{field.id}'")
        if asset.size_bytes > field.max_file_size_bytes:
            issues.append(f"Upload asset '{asset.id}' exceeds field '{field.id}' size limit")
        if asset.content_type not in field.accepted_mime_types:
            issues.append(f"Upload asset '{asset.id}' content type is not allowed for field '{field.id}'")
        if isinstance(field, FileUploadField) and field.accepted_extensions:
            extension = "." + asset.filename.rsplit(".", 1)[-1].lower() if "." in asset.filename else ""
            if extension not in field.accepted_extensions:
                issues.append(f"Upload asset '{asset.id}' extension is not allowed for field '{field.id}'")
        return issues

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


def _plain_text_from_markdown(content: str) -> str:
    without_markdown = MARKDOWN_CONTROL_RE.sub(" ", content)
    normalized = normalize_plain_text(without_markdown)
    return re.sub(r"\s+([.,;:!?])", r"\1", normalized) if normalized else ""


def _upload_asset_answer(asset: UploadAsset) -> dict[str, Any]:
    return {
        "assetId": asset.id,
        "filename": asset.filename,
        "contentType": asset.content_type,
        "sizeBytes": asset.size_bytes,
        "downloadUrl": f"/uploads/{asset.id}/download",
    }
