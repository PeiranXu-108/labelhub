import json
import re
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.agent.config import LLMProviderConfig, load_llm_provider_config
from app.agent.providers import FieldAssistModel, build_field_assist_model
from app.agent.schemas import FieldAssistResult
from app.domain.enums import SubmissionStatus
from app.models import Assignment, AuditLog, LLMFieldAssistLog, Submission
from app.schemas.llm_assist import LLMFieldAssistRequest, LLMFieldAssistResponse
from app.schemas.template import (
    LlmOutputSchema,
    LlmTriggerField,
    ShowItemField,
    TemplateDocument,
    TemplateField,
)
from app.services.templates import TemplateService
from app.services.workflow import ActorContext


PLACEHOLDER_PATTERN = re.compile(r"{{\s*([A-Za-z0-9_$.]+)\s*}}")
EDITABLE_STATUSES = {
    SubmissionStatus.DRAFT,
    SubmissionStatus.RETURNED,
    SubmissionStatus.AI_RETURNED,
}


class LLMFieldAssistError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class LLMFieldAssistService:
    def __init__(
        self,
        db: Session,
        *,
        model: FieldAssistModel | None = None,
        provider_config: LLMProviderConfig | None = None,
    ) -> None:
        self.db = db
        self.model = model
        self.provider_config = provider_config

    def assist_assignment(
        self,
        assignment_id: str,
        actor: ActorContext,
        request: LLMFieldAssistRequest,
    ) -> LLMFieldAssistResponse:
        assignment = self._get_owned_assignment(assignment_id, actor)
        submission = assignment.submission
        if SubmissionStatus(submission.status) not in EDITABLE_STATUSES:
            raise LLMFieldAssistError(
                "INVALID_ASSIST_STATE",
                "Only draft or returned submissions can use field-level LLM assist",
                400,
            )

        schema = TemplateDocument.model_validate(submission.template_schema.schema_payload)
        trigger = self._trigger_field(schema, request.trigger_field_id)
        target_field = self._target_field(schema, trigger.target_field_id)
        current_answers = {**(submission.answer_payload or {}), **request.answer_payload}
        self._ensure_target_visible(schema, trigger.target_field_id, current_answers)
        provider_config = self._provider_config(trigger)
        prompt_snapshot = self._build_prompt_snapshot(
            assignment=assignment,
            submission=submission,
            schema=schema,
            trigger=trigger,
            target_field=target_field,
            current_answers=current_answers,
        )

        model = self.model or build_field_assist_model(provider_config)
        raw_response: object | None = None
        try:
            raw_response = model.invoke(prompt_snapshot)
            result = self._validate_model_result(raw_response)
            value = self._validate_assist_value(
                value=result.value,
                output_schema=trigger.output_schema,
                target_field=target_field,
                submission=submission,
            )
        except LLMFieldAssistError as exc:
            self._persist_log(
                assignment=assignment,
                submission=submission,
                actor=actor,
                trigger=trigger,
                status="failed",
                prompt_snapshot=prompt_snapshot,
                provider_config=provider_config,
                raw_response=raw_response,
                structured_response=None,
                failure_reason=exc.message,
            )
            raise
        except Exception as exc:
            message = str(exc)
            code = "LLM_PROVIDER_FAILED"
            status_code = 502
            if "Missing LABELHUB_LLM_API_KEY" in message:
                code = "LLM_PROVIDER_UNAVAILABLE"
                status_code = 503
                message = "Live field-level LLM assist requires server-side provider credentials."
            self._persist_log(
                assignment=assignment,
                submission=submission,
                actor=actor,
                trigger=trigger,
                status="failed",
                prompt_snapshot=prompt_snapshot,
                provider_config=provider_config,
                raw_response=raw_response,
                structured_response=None,
                failure_reason=str(exc),
            )
            raise LLMFieldAssistError(code, message, status_code) from exc

        structured_response = result.model_dump(mode="json")
        structured_response["value"] = value
        log = self._persist_log(
            assignment=assignment,
            submission=submission,
            actor=actor,
            trigger=trigger,
            status="succeeded",
            prompt_snapshot=prompt_snapshot,
            provider_config=provider_config,
            raw_response=raw_response,
            structured_response=structured_response,
            failure_reason=None,
        )
        return LLMFieldAssistResponse(
            log_id=log.id,
            trigger_field_id=trigger.id,
            target_field_id=trigger.target_field_id,
            mode=trigger.mode,
            status="succeeded",
            value=value,
            rationale=result.rationale,
            confidence=result.confidence,
            model_name=provider_config.model,
            created_at=log.created_at,
        )

    def _get_owned_assignment(self, assignment_id: str, actor: ActorContext) -> Assignment:
        assignment = self.db.scalar(
            select(Assignment)
            .options(
                joinedload(Assignment.item),
                joinedload(Assignment.submission).joinedload(Submission.template_schema),
            )
            .where(Assignment.id == assignment_id)
        )
        if assignment is None:
            raise LLMFieldAssistError("ASSIGNMENT_NOT_FOUND", "Assignment was not found", 404)
        if assignment.labeler_id != actor.user_id:
            raise LLMFieldAssistError("PERMISSION_DENIED", "Labeler does not own this assignment", 403)
        return assignment

    def _trigger_field(self, schema: TemplateDocument, trigger_field_id: str) -> LlmTriggerField:
        for field in schema.fields:
            if field.id == trigger_field_id and isinstance(field, LlmTriggerField):
                return field
        raise LLMFieldAssistError("LLM_TRIGGER_NOT_FOUND", "LLM trigger field was not found", 404)

    def _target_field(self, schema: TemplateDocument, target_field_id: str) -> TemplateField:
        for field in schema.fields:
            if field.id == target_field_id and not isinstance(field, (ShowItemField, LlmTriggerField)):
                return field
        raise LLMFieldAssistError("LLM_TARGET_FIELD_INVALID", "LLM trigger target field is not answerable", 400)

    def _ensure_target_visible(
        self,
        schema: TemplateDocument,
        target_field_id: str,
        current_answers: dict[str, Any],
    ) -> None:
        visible_field_ids = TemplateService(self.db)._visible_field_ids(schema, current_answers)
        if target_field_id not in visible_field_ids:
            raise LLMFieldAssistError(
                "LLM_TARGET_FIELD_HIDDEN",
                "LLM trigger target field is hidden for the current answers",
                400,
            )

    def _provider_config(self, trigger: LlmTriggerField) -> LLMProviderConfig:
        if self.provider_config is not None:
            return self.provider_config
        return load_llm_provider_config(temperature_override=trigger.temperature)

    def _build_prompt_snapshot(
        self,
        *,
        assignment: Assignment,
        submission: Submission,
        schema: TemplateDocument,
        trigger: LlmTriggerField,
        target_field: TemplateField,
        current_answers: dict[str, Any],
    ) -> str:
        prompt_answers = self._prompt_answers(trigger, current_answers)
        rendered_template = self._render_prompt_template(
            trigger.prompt_template,
            item_payload=assignment.item.payload,
            answers=prompt_answers,
        )
        context = {
            "task": {
                "id": assignment.task_id,
                "name": assignment.task.name,
                "description": assignment.task.description,
            },
            "item": {
                "id": assignment.item.id,
                "external_id": assignment.item.external_id,
                "payload": assignment.item.payload,
            },
            "submission": {
                "id": submission.id,
                "attempt": submission.attempt,
                "schema_version": submission.schema_version,
                "current_answers": prompt_answers,
                "current_target_value": current_answers.get(trigger.target_field_id),
            },
            "trigger": trigger.model_dump(by_alias=True, mode="json"),
            "target_field": target_field.model_dump(by_alias=True, mode="json"),
            "template_schema": schema.model_dump(by_alias=True, mode="json"),
        }
        return "\n".join(
            [
                "You are the LabelHub field-level LLM assist agent.",
                "Use only the immutable template snapshot, current item payload, and current answers below.",
                (
                    "Return only a JSON object matching this envelope: "
                    "{\"value\": <target value>, \"rationale\": <optional string>, "
                    "\"confidence\": <optional number 0-1>}."
                ),
                "The value must satisfy the target field type and the configured outputSchema.",
                "Do not include markdown fences or free-form commentary outside the JSON object.",
                "",
                "Rendered prompt template:",
                rendered_template,
                "",
                "Frozen assist context:",
                _stable_json(context),
            ]
        )

    def _prompt_answers(self, trigger: LlmTriggerField, current_answers: dict[str, Any]) -> dict[str, Any]:
        if not trigger.context_fields:
            return current_answers
        prompt_answers = {
            field_id: current_answers.get(field_id)
            for field_id in trigger.context_fields
            if field_id in current_answers
        }
        if trigger.target_field_id in current_answers:
            prompt_answers[trigger.target_field_id] = current_answers[trigger.target_field_id]
        return prompt_answers

    def _render_prompt_template(
        self,
        prompt_template: str,
        *,
        item_payload: dict[str, Any],
        answers: dict[str, Any],
    ) -> str:
        def replace(match: re.Match[str]) -> str:
            value = self._resolve_placeholder(match.group(1), item_payload=item_payload, answers=answers)
            if value is None:
                return ""
            if isinstance(value, (dict, list)):
                return _stable_json(value)
            return str(value)

        return PLACEHOLDER_PATTERN.sub(replace, prompt_template)

    def _resolve_placeholder(
        self,
        path: str,
        *,
        item_payload: dict[str, Any],
        answers: dict[str, Any],
    ) -> Any:
        if path == "answers":
            return answers
        if path.startswith("answers."):
            return _resolve_path(answers, path.removeprefix("answers."))
        if path == "item.payload":
            return item_payload
        if path.startswith("item.payload."):
            return _resolve_path(item_payload, path.removeprefix("item.payload."))
        return None

    def _validate_model_result(self, raw_response: object) -> FieldAssistResult:
        try:
            if isinstance(raw_response, FieldAssistResult):
                return raw_response
            return FieldAssistResult.model_validate(raw_response)
        except (TypeError, ValidationError, ValueError) as exc:
            raise LLMFieldAssistError("LLM_FIELD_OUTPUT_INVALID", str(exc), 502) from exc

    def _validate_assist_value(
        self,
        *,
        value: Any,
        output_schema: LlmOutputSchema,
        target_field: TemplateField,
        submission: Submission,
    ) -> Any:
        output_issues = self._validate_output_schema(value, output_schema)
        if output_issues:
            raise LLMFieldAssistError("LLM_FIELD_VALUE_INVALID", "; ".join(output_issues), 422)

        field_issues, normalized_value = TemplateService(self.db)._validate_field_answer(
            target_field,
            value,
            submission=submission,
        )
        if field_issues:
            raise LLMFieldAssistError("LLM_FIELD_VALUE_INVALID", "; ".join(field_issues), 422)
        return normalized_value

    def _validate_output_schema(self, value: Any, output_schema: LlmOutputSchema) -> list[str]:
        issues: list[str] = []
        if output_schema.preset == "text" and not isinstance(value, str):
            issues.append("Field assist value must be a string")
        elif output_schema.preset == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))):
            issues.append("Field assist value must be a number")
        elif output_schema.preset == "json_object" and (not isinstance(value, dict) or isinstance(value, list)):
            issues.append("Field assist value must be a JSON object")
        elif output_schema.preset == "json_array" and not isinstance(value, list):
            issues.append("Field assist value must be a JSON array")
        if output_schema.json_schema:
            issues.extend(_validate_json_schema(value, output_schema.json_schema, "Field assist value"))
        return issues

    def _persist_log(
        self,
        *,
        assignment: Assignment,
        submission: Submission,
        actor: ActorContext,
        trigger: LlmTriggerField,
        status: str,
        prompt_snapshot: str | None,
        provider_config: LLMProviderConfig,
        raw_response: object | None,
        structured_response: dict[str, Any] | None,
        failure_reason: str | None,
    ) -> LLMFieldAssistLog:
        log = LLMFieldAssistLog(
            task_id=assignment.task_id,
            assignment_id=assignment.id,
            submission_id=submission.id,
            template_schema_id=submission.template_schema_id,
            actor_id=actor.user_id,
            actor_role=actor.role.value,
            trigger_field_id=trigger.id,
            target_field_id=trigger.target_field_id,
            mode=trigger.mode,
            status=status,
            prompt_snapshot=prompt_snapshot,
            output_schema=trigger.output_schema.model_dump(by_alias=True, mode="json"),
            structured_response=structured_response,
            raw_provider_response=_safe_raw_response(raw_response),
            provider_metadata=provider_config.metadata,
            failure_reason=failure_reason,
        )
        self.db.add(log)
        self.db.flush()
        self.db.add(
            AuditLog(
                entity_type="submission",
                entity_id=submission.id,
                action="llm_field_assist",
                actor_id=actor.user_id,
                actor_role=actor.role.value,
                details={
                    "assist_log_id": log.id,
                    "assignment_id": assignment.id,
                    "trigger_field_id": trigger.id,
                    "target_field_id": trigger.target_field_id,
                    "mode": trigger.mode,
                    "status": status,
                    "model": provider_config.model,
                },
            )
        )
        self.db.commit()
        self.db.refresh(log)
        return log


def _stable_json(value: dict[str, Any] | list[Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def _resolve_path(payload: dict[str, Any], path: str) -> Any:
    current: Any = payload
    for segment in path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def _safe_raw_response(raw_response: object | None) -> dict[str, Any] | None:
    if raw_response is None:
        return None
    if isinstance(raw_response, FieldAssistResult):
        return raw_response.model_dump(mode="json")
    if isinstance(raw_response, dict):
        return raw_response
    return {"repr": repr(raw_response)}


def _validate_json_schema(value: Any, schema: dict[str, Any], label: str) -> list[str]:
    issues: list[str] = []
    expected_type = schema.get("type")
    if isinstance(expected_type, list):
        type_matches = any(_json_type_matches(value, entry) for entry in expected_type if isinstance(entry, str))
    elif isinstance(expected_type, str):
        type_matches = _json_type_matches(value, expected_type)
    else:
        type_matches = True
    if not type_matches:
        issues.append(f"{label} must be {expected_type}")
        return issues

    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and value not in enum_values:
        issues.append(f"{label} must be one of {enum_values}")

    if isinstance(value, str):
        min_length = schema.get("minLength")
        max_length = schema.get("maxLength")
        if isinstance(min_length, int) and len(value) < min_length:
            issues.append(f"{label} must be at least {min_length} characters")
        if isinstance(max_length, int) and len(value) > max_length:
            issues.append(f"{label} must be at most {max_length} characters")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if isinstance(minimum, (int, float)) and value < minimum:
            issues.append(f"{label} must be greater than or equal to {minimum}")
        if isinstance(maximum, (int, float)) and value > maximum:
            issues.append(f"{label} must be less than or equal to {maximum}")

    if isinstance(value, dict):
        required = schema.get("required")
        if isinstance(required, list):
            for key in required:
                if isinstance(key, str) and key not in value:
                    issues.append(f"{label}.{key} is required")
        properties = schema.get("properties")
        if isinstance(properties, dict):
            for key, child_schema in properties.items():
                if key in value and isinstance(child_schema, dict):
                    issues.extend(_validate_json_schema(value[key], child_schema, f"{label}.{key}"))

    if isinstance(value, list):
        min_items = schema.get("minItems")
        max_items = schema.get("maxItems")
        if isinstance(min_items, int) and len(value) < min_items:
            issues.append(f"{label} must contain at least {min_items} items")
        if isinstance(max_items, int) and len(value) > max_items:
            issues.append(f"{label} must contain at most {max_items} items")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                issues.extend(_validate_json_schema(item, item_schema, f"{label}[{index}]"))

    return issues


def _json_type_matches(value: Any, expected_type: str) -> bool:
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "null":
        return value is None
    return True
