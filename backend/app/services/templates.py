from datetime import UTC, datetime
import re
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Submission, Task, TemplateSchema, UploadAsset
from app.schemas.template import (
    CheckboxGroupField,
    CrossFieldValidation,
    CustomValidation,
    FileUploadField,
    ImageUploadField,
    JsonField,
    LlmTriggerField,
    MaxLengthValidation,
    MinLengthValidation,
    NumberField,
    NumberMaxValidation,
    NumberMinValidation,
    OptionField,
    RatingField,
    RegexValidation,
    RequiredValidation,
    RichTextField,
    ShowItemField,
    SubmissionValidationError,
    TemplateDocument,
    TextField,
    VisibilityCondition,
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
        self._get_owned_task(task_id, actor)

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
        self._get_owned_task(task_id, actor)

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
        visible_field_ids = self._visible_field_ids(schema, answer_payload)

        for answer_id in answer_payload:
            if answer_id not in answerable_ids:
                issues.append(f"Unknown field '{answer_id}'")

        for field in answerable_fields:
            value_present = field.id in answer_payload
            value = answer_payload.get(field.id)
            if field.id not in visible_field_ids:
                if value_present:
                    normalized_payload[field.id] = value
                continue
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

        issues.extend(
            self._validate_runtime_validations(
                schema,
                answer_payload,
                visible_field_ids,
                require_required=require_required,
            )
        )
        if issues:
            raise SubmissionValidationError(issues)
        return normalized_payload

    def _visible_field_ids(self, schema: TemplateDocument, answer_payload: dict[str, Any]) -> set[str]:
        all_field_ids = {field.id for field in schema.fields}
        visible_field_ids = set(all_field_ids)
        rules_by_target: dict[str, list[Any]] = {}
        for rule in schema.visibility_rules:
            rules_by_target.setdefault(rule.target_field_id, []).append(rule)
        for _ in range(len(rules_by_target) + 1):
            next_visible_field_ids = set(all_field_ids)
            for target_field_id, rules in rules_by_target.items():
                if not any(
                    self._evaluate_visibility_condition(rule.condition, answer_payload, visible_field_ids)
                    for rule in rules
                ):
                    next_visible_field_ids.discard(target_field_id)
            if next_visible_field_ids == visible_field_ids:
                return next_visible_field_ids
            visible_field_ids = next_visible_field_ids
        return visible_field_ids

    def _evaluate_visibility_condition(
        self,
        condition: VisibilityCondition,
        answer_payload: dict[str, Any],
        visible_field_ids: set[str],
    ) -> bool:
        if condition.source_field_id not in visible_field_ids:
            return False
        source_value = answer_payload.get(condition.source_field_id)
        return self._compare_condition_value(source_value, condition.operator, condition.value)

    def _compare_condition_value(self, source_value: Any, operator: str, expected_value: Any) -> bool:
        if operator == "equals":
            return source_value == expected_value
        if operator == "not_equals":
            return source_value != expected_value
        if operator == "in":
            return isinstance(expected_value, list) and source_value in expected_value
        if operator == "not_in":
            return isinstance(expected_value, list) and source_value not in expected_value
        if operator == "contains":
            if isinstance(source_value, list):
                return expected_value in source_value
            if isinstance(source_value, str) and isinstance(expected_value, str):
                return expected_value in source_value
            return False
        if operator == "not_contains":
            if isinstance(source_value, list):
                return expected_value not in source_value
            if isinstance(source_value, str) and isinstance(expected_value, str):
                return expected_value not in source_value
            return True
        if operator == "is_empty":
            return self._is_empty(source_value)
        if operator == "is_not_empty":
            return not self._is_empty(source_value)
        return False

    def _validate_runtime_validations(
        self,
        schema: TemplateDocument,
        answer_payload: dict[str, Any],
        visible_field_ids: set[str],
        *,
        require_required: bool,
    ) -> list[str]:
        issues: list[str] = []
        for validation in schema.validations:
            if validation.field_id not in visible_field_ids:
                continue
            value = answer_payload.get(validation.field_id)
            if isinstance(validation, RequiredValidation):
                if require_required and self._is_empty(value):
                    issues.append(
                        validation.message or f"Required field '{validation.field_id}' is missing"
                    )
                continue
            if self._is_empty(value):
                continue
            if isinstance(validation, MinLengthValidation):
                text_value = self._text_value(value)
                if text_value is None:
                    issues.append(validation.message or f"Field '{validation.field_id}' must be a string")
                elif len(text_value) < validation.limit:
                    issues.append(
                        validation.message
                        or f"Field '{validation.field_id}' must be at least {validation.limit} characters"
                    )
                continue
            if isinstance(validation, MaxLengthValidation):
                text_value = self._text_value(value)
                if text_value is None:
                    issues.append(validation.message or f"Field '{validation.field_id}' must be a string")
                elif len(text_value) > validation.limit:
                    issues.append(
                        validation.message
                        or f"Field '{validation.field_id}' must be at most {validation.limit} characters"
                    )
                continue
            if isinstance(validation, NumberMinValidation):
                number_value = self._number_value(value)
                if number_value is None:
                    issues.append(validation.message or f"Field '{validation.field_id}' must be a number")
                elif number_value < validation.value:
                    issues.append(
                        validation.message
                        or f"Field '{validation.field_id}' must be greater than or equal to {validation.value}"
                    )
                continue
            if isinstance(validation, NumberMaxValidation):
                number_value = self._number_value(value)
                if number_value is None:
                    issues.append(validation.message or f"Field '{validation.field_id}' must be a number")
                elif number_value > validation.value:
                    issues.append(
                        validation.message
                        or f"Field '{validation.field_id}' must be less than or equal to {validation.value}"
                    )
                continue
            if isinstance(validation, RegexValidation):
                text_value = self._text_value(value)
                if text_value is None:
                    issues.append(validation.message or f"Field '{validation.field_id}' must be a string")
                    continue
                flags = re.IGNORECASE if "i" in validation.flags else 0
                if re.search(validation.pattern, text_value, flags) is None:
                    issues.append(
                        validation.message or f"Field '{validation.field_id}' does not match the required pattern"
                    )
                continue
            if isinstance(validation, CrossFieldValidation):
                if validation.other_field_id not in visible_field_ids:
                    continue
                other_value = answer_payload.get(validation.other_field_id)
                if self._is_empty(value) or self._is_empty(other_value):
                    continue
                comparison_issue = self._validate_cross_field(validation, value, other_value)
                if comparison_issue:
                    issues.append(validation.message or comparison_issue)
                continue
            if isinstance(validation, CustomValidation):
                custom_issue = self._validate_custom(validation.name, validation.field_id, value)
                if custom_issue:
                    issues.append(validation.message or custom_issue)
                continue
        return issues

    def _validate_cross_field(
        self, validation: CrossFieldValidation, value: Any, other_value: Any
    ) -> str | None:
        operator = validation.operator
        if operator == "equals":
            if value != other_value:
                return f"Field '{validation.field_id}' must equal field '{validation.other_field_id}'"
            return None
        if operator == "not_equals":
            if value == other_value:
                return f"Field '{validation.field_id}' must not equal field '{validation.other_field_id}'"
            return None
        number_value = self._number_value(value)
        other_number_value = self._number_value(other_value)
        if number_value is None or other_number_value is None:
            return (
                f"Fields '{validation.field_id}' and '{validation.other_field_id}' must both be numbers "
                "for numeric comparison"
            )
        if operator == "greater_than" and number_value <= other_number_value:
            return f"Field '{validation.field_id}' must be greater than field '{validation.other_field_id}'"
        if operator == "greater_than_or_equal" and number_value < other_number_value:
            return f"Field '{validation.field_id}' must be greater than or equal to field '{validation.other_field_id}'"
        if operator == "less_than" and number_value >= other_number_value:
            return f"Field '{validation.field_id}' must be less than field '{validation.other_field_id}'"
        if operator == "less_than_or_equal" and number_value > other_number_value:
            return f"Field '{validation.field_id}' must be less than or equal to field '{validation.other_field_id}'"
        return None

    def _validate_custom(self, name: str, field_id: str, value: Any) -> str | None:
        if name == "no_whitespace_edges":
            if not isinstance(value, str):
                return f"Field '{field_id}' must be a string"
            if value != value.strip():
                return f"Field '{field_id}' cannot contain leading or trailing whitespace"
            return None
        if name == "non_empty_json_object":
            if not isinstance(value, dict) or not value:
                return f"Field '{field_id}' must be a non-empty JSON object"
            return None
        if name == "https_url":
            if not isinstance(value, str):
                return f"Field '{field_id}' must be a string"
            parsed = urlparse(value)
            if parsed.scheme != "https" or not parsed.netloc:
                return f"Field '{field_id}' must be an HTTPS URL"
            return None
        return f"Field '{field_id}' uses unsupported custom validator '{name}'"

    def _text_value(self, value: Any) -> str | None:
        if isinstance(value, str):
            return value
        if isinstance(value, dict) and isinstance(value.get("plainText"), str):
            return value["plainText"]
        return None

    def _number_value(self, value: Any) -> float | None:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return float(value)

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

    def _get_owned_task(self, task_id: str, actor: ActorContext) -> Task:
        task = self.db.get(Task, task_id)
        if task is None:
            raise WorkflowError("TASK_NOT_FOUND", "Task was not found")
        if task.created_by != actor.user_id:
            raise WorkflowError("PERMISSION_DENIED", "Only the task owner can modify this template")
        return task

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
