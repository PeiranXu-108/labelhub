from datetime import datetime
from typing import Annotated, Any, Literal
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


FIELD_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
ITEM_SOURCE_PATTERN = re.compile(r"^item\.payload(?:\.[A-Za-z_][A-Za-z0-9_]*)*$")
MIME_TYPE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$", re.IGNORECASE)
FILE_EXTENSION_PATTERN = re.compile(r"^\.[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")
MAX_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_COUNT = 10
MAX_REGEX_PATTERN_LENGTH = 256
MAX_REGEX_REPEAT_BOUND = 100
DEFAULT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
DEFAULT_FILE_MIME_TYPES = ["application/pdf", "text/plain"]
IMAGE_MIME_TYPES = set(DEFAULT_IMAGE_MIME_TYPES)
SUPPORTED_CUSTOM_VALIDATORS = {
    "no_whitespace_edges",
    "non_empty_json_object",
    "https_url",
}
SAFE_REGEX_FLAGS = {"i"}
SAFE_REGEX_LITERAL_ESCAPES = set(r".^$*+?{}[]\|()-")
SAFE_REGEX_SHORTHAND_ESCAPES = set("dDsSwW")
LLM_TEMPERATURE_PRESETS = {0.0, 0.2, 0.7, 1.0}


def validate_field_reference(value: str, *, field_name: str = "field reference") -> str:
    if not FIELD_ID_PATTERN.match(value):
        raise ValueError(f"{field_name} must reference a stable field id")
    return value


def is_escaped(value: str, index: int) -> bool:
    slash_count = 0
    cursor = index - 1
    while cursor >= 0 and value[cursor] == "\\":
        slash_count += 1
        cursor -= 1
    return slash_count % 2 == 1


def is_safe_regex_subset(pattern: str) -> bool:
    can_quantify = False
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if char in "^$":
            can_quantify = False
            index += 1
            continue
        if char == "[":
            close_index = find_character_class_end(pattern, index)
            if close_index is None or close_index == index + 1:
                return False
            can_quantify = True
            index = close_index + 1
            continue
        if char == "\\":
            if index + 1 >= len(pattern):
                return False
            escaped = pattern[index + 1]
            if escaped in SAFE_REGEX_SHORTHAND_ESCAPES or escaped in SAFE_REGEX_LITERAL_ESCAPES:
                can_quantify = True
                index += 2
                continue
            return False
        if char in "()|.":
            return False
        if char in "*+":
            return False
        if char == "?":
            return False
        if char == "{":
            if not can_quantify:
                return False
            close_index = pattern.find("}", index + 1)
            if close_index == -1 or not is_bounded_repeat(pattern[index + 1 : close_index]):
                return False
            can_quantify = False
            index = close_index + 1
            continue
        if char in "}]":
            return False
        can_quantify = True
        index += 1
    return True


def find_character_class_end(pattern: str, open_index: int) -> int | None:
    for index in range(open_index + 1, len(pattern)):
        if pattern[index] == "]" and not is_escaped(pattern, index):
            return index
    return None


def is_bounded_repeat(value: str) -> bool:
    if value.isdigit():
        upper = int(value)
        return upper <= MAX_REGEX_REPEAT_BOUND
    return False


class TemplateOption(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    value: str = Field(min_length=1, max_length=255)


class BaseTemplateField(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=255)
    required: bool = False
    help_text: str | None = Field(default=None, alias="helpText", max_length=500)

    @field_validator("id")
    @classmethod
    def validate_field_id(cls, value: str) -> str:
        if not FIELD_ID_PATTERN.match(value):
            raise ValueError("Field id must start with a letter and contain only letters, numbers, and underscores")
        return value


class ShowItemField(BaseTemplateField):
    type: Literal["show_item"]
    source: str = Field(min_length=1, max_length=255)
    required: bool = False

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        if not ITEM_SOURCE_PATTERN.match(value):
            raise ValueError("show_item source must use item.payload paths, for example item.payload.text")
        return value


class TextField(BaseTemplateField):
    type: Literal["text"]
    placeholder: str | None = Field(default=None, max_length=255)
    min_length: int | None = Field(default=None, alias="minLength", ge=0)
    max_length: int | None = Field(default=None, alias="maxLength", ge=1)


class TextareaField(TextField):
    type: Literal["textarea"]


class RichTextField(BaseTemplateField):
    type: Literal["rich_text"]
    placeholder: str | None = Field(default=None, max_length=255)
    min_length: int | None = Field(default=None, alias="minLength", ge=0)
    max_length: int | None = Field(default=None, alias="maxLength", ge=1)
    plain_text_fallback: bool = Field(default=True, alias="plainTextFallback")

    @model_validator(mode="after")
    def validate_rich_text_range(self) -> "RichTextField":
        if self.min_length is not None and self.max_length is not None and self.max_length < self.min_length:
            raise ValueError("rich_text maxLength must be greater than or equal to minLength")
        if not self.plain_text_fallback:
            raise ValueError("rich_text plainTextFallback must remain true")
        return self


class NumberField(BaseTemplateField):
    type: Literal["number"]
    min_value: float | None = Field(default=None, alias="min")
    max_value: float | None = Field(default=None, alias="max")


class OptionField(BaseTemplateField):
    options: list[TemplateOption] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_option_values(self) -> "OptionField":
        values = [option.value for option in self.options]
        if len(values) != len(set(values)):
            raise ValueError("Option values must be unique")
        return self


class RadioField(OptionField):
    type: Literal["radio"]


class CheckboxGroupField(OptionField):
    type: Literal["checkbox_group"]


class SelectField(OptionField):
    type: Literal["select"]


class RatingField(BaseTemplateField):
    type: Literal["rating"]
    min_value: int = Field(default=1, alias="min", ge=0)
    max_value: int = Field(default=5, alias="max", ge=1)

    @model_validator(mode="after")
    def validate_rating_range(self) -> "RatingField":
        if self.max_value <= self.min_value:
            raise ValueError("rating max must be greater than min")
        return self


class JsonField(BaseTemplateField):
    type: Literal["json"]


class LlmOutputSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    preset: Literal["target_field", "text", "number", "json_object", "json_array"] = "target_field"
    json_schema: dict[str, Any] | None = Field(default=None, alias="jsonSchema")


class LlmTriggerField(BaseTemplateField):
    type: Literal["llm_trigger"]
    prompt_template: str = Field(alias="promptTemplate", min_length=1, max_length=5000)
    target_field_id: str = Field(alias="targetFieldId", min_length=1, max_length=64)
    mode: Literal["suggest", "prefill", "overwrite_with_confirmation"] = "suggest"
    output_schema: LlmOutputSchema = Field(default_factory=LlmOutputSchema, alias="outputSchema")
    context_fields: list[str] = Field(default_factory=list, alias="contextFields", max_length=20)
    temperature: float | None = Field(default=None, ge=0, le=2)
    required: bool = False

    @field_validator("target_field_id")
    @classmethod
    def validate_target_field_id(cls, value: str) -> str:
        if not FIELD_ID_PATTERN.match(value):
            raise ValueError("targetFieldId must reference a stable field id")
        return value

    @field_validator("context_fields")
    @classmethod
    def validate_context_fields(cls, value: list[str]) -> list[str]:
        for field_id in value:
            validate_field_reference(field_id, field_name="contextFields entry")
        if len(value) != len(set(value)):
            raise ValueError("contextFields values must be unique")
        return value

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, value: float | None) -> float | None:
        if value is not None and value not in LLM_TEMPERATURE_PRESETS:
            raise ValueError("temperature must use an allowed preset")
        return value


class UploadField(BaseTemplateField):
    accepted_mime_types: list[str] = Field(
        default_factory=lambda: DEFAULT_FILE_MIME_TYPES.copy(),
        alias="acceptedMimeTypes",
        min_length=1,
        max_length=20,
    )
    max_file_size_bytes: int = Field(
        default=10 * 1024 * 1024,
        alias="maxFileSizeBytes",
        ge=1,
        le=MAX_UPLOAD_FILE_SIZE_BYTES,
    )
    max_count: int = Field(default=1, alias="maxCount", ge=1, le=MAX_UPLOAD_COUNT)

    @field_validator("accepted_mime_types")
    @classmethod
    def normalize_mime_types(cls, value: list[str]) -> list[str]:
        normalized = [entry.strip().lower() for entry in value]
        if any(not entry for entry in normalized):
            raise ValueError("acceptedMimeTypes cannot contain empty values")
        if len(normalized) != len(set(normalized)):
            raise ValueError("acceptedMimeTypes values must be unique")
        if any(not MIME_TYPE_PATTERN.match(entry) for entry in normalized):
            raise ValueError("acceptedMimeTypes entries must be concrete MIME types")
        return normalized


class ImageUploadField(UploadField):
    type: Literal["image_upload"]
    accepted_mime_types: list[str] = Field(
        default_factory=lambda: DEFAULT_IMAGE_MIME_TYPES.copy(),
        alias="acceptedMimeTypes",
        min_length=1,
        max_length=20,
    )
    max_file_size_bytes: int = Field(
        default=5 * 1024 * 1024,
        alias="maxFileSizeBytes",
        ge=1,
        le=MAX_UPLOAD_FILE_SIZE_BYTES,
    )

    @model_validator(mode="after")
    def validate_image_mime_types(self) -> "ImageUploadField":
        if any(mime_type not in IMAGE_MIME_TYPES for mime_type in self.accepted_mime_types):
            raise ValueError("image_upload acceptedMimeTypes must be image MIME types")
        return self


class FileUploadField(UploadField):
    type: Literal["file_upload"]
    accepted_extensions: list[str] = Field(default_factory=list, alias="acceptedExtensions", max_length=20)

    @field_validator("accepted_extensions")
    @classmethod
    def normalize_extensions(cls, value: list[str]) -> list[str]:
        normalized = [entry.strip().lower() for entry in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("acceptedExtensions values must be unique")
        if any(not FILE_EXTENSION_PATTERN.match(entry) for entry in normalized):
            raise ValueError("acceptedExtensions entries must start with a dot")
        return normalized


TemplateField = Annotated[
    ShowItemField
    | TextField
    | TextareaField
    | RichTextField
    | NumberField
    | RadioField
    | CheckboxGroupField
    | SelectField
    | RatingField
    | JsonField
    | LlmTriggerField
    | ImageUploadField
    | FileUploadField,
    Field(discriminator="type"),
]


class LayoutGroup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    field_ids: list[str] = Field(alias="fieldIds", min_length=1)

    @field_validator("id")
    @classmethod
    def validate_group_id(cls, value: str) -> str:
        return validate_field_reference(value, field_name="layout group id")

    @field_validator("field_ids")
    @classmethod
    def validate_field_ids(cls, value: list[str]) -> list[str]:
        for field_id in value:
            validate_field_reference(field_id)
        if len(value) != len(set(value)):
            raise ValueError("layout group fieldIds must be unique within the group")
        return value


class TemplateLayout(BaseModel):
    type: Literal["single", "group", "tabs"] = "single"
    groups: list[LayoutGroup] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_layout_groups(self) -> "TemplateLayout":
        group_ids = [group.id for group in self.groups]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("layout group ids must be unique")
        if self.type in {"group", "tabs"} and not self.groups:
            raise ValueError("group and tabs layouts require at least one group")
        return self


class VisibilityCondition(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_field_id: str = Field(alias="sourceFieldId", min_length=1, max_length=64)
    operator: Literal[
        "equals",
        "not_equals",
        "in",
        "not_in",
        "contains",
        "not_contains",
        "is_empty",
        "is_not_empty",
    ]
    value: Any = None

    @field_validator("source_field_id")
    @classmethod
    def validate_source_field_id(cls, value: str) -> str:
        return validate_field_reference(value, field_name="visibility sourceFieldId")

    @model_validator(mode="after")
    def validate_condition_value(self) -> "VisibilityCondition":
        if self.operator in {"in", "not_in"} and not isinstance(self.value, list):
            raise ValueError("visibility in/not_in conditions require a list value")
        if self.operator not in {"is_empty", "is_not_empty"} and self.value is None:
            raise ValueError("visibility condition value is required")
        return self


class VisibilityRule(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, min_length=1, max_length=64)
    target_field_id: str = Field(alias="targetFieldId", min_length=1, max_length=64)
    effect: Literal["show"] = "show"
    condition: VisibilityCondition

    @field_validator("id")
    @classmethod
    def validate_rule_id(cls, value: str | None) -> str | None:
        if value is not None:
            validate_field_reference(value, field_name="visibility rule id")
        return value

    @field_validator("target_field_id")
    @classmethod
    def validate_target_field_id(cls, value: str) -> str:
        return validate_field_reference(value, field_name="visibility targetFieldId")


def has_visibility_cycle(rules: list[VisibilityRule]) -> bool:
    edges: dict[str, list[str]] = {}
    for rule in rules:
        edges.setdefault(rule.condition.source_field_id, []).append(rule.target_field_id)

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(field_id: str) -> bool:
        if field_id in visiting:
            return True
        if field_id in visited:
            return False
        visiting.add(field_id)
        has_cycle = any(visit(target_field_id) for target_field_id in edges.get(field_id, []))
        visiting.remove(field_id)
        visited.add(field_id)
        return has_cycle

    return any(visit(field_id) for field_id in edges)


class BaseAnswerValidation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    field_id: str = Field(alias="fieldId", min_length=1, max_length=64)
    message: str | None = Field(default=None, max_length=500)

    @field_validator("field_id")
    @classmethod
    def validate_field_id(cls, value: str) -> str:
        return validate_field_reference(value, field_name="validation fieldId")


class RequiredValidation(BaseAnswerValidation):
    type: Literal["required"]


class MinLengthValidation(BaseAnswerValidation):
    type: Literal["min_length"]
    limit: int = Field(ge=0)


class MaxLengthValidation(BaseAnswerValidation):
    type: Literal["max_length"]
    limit: int = Field(ge=1)


class NumberMinValidation(BaseAnswerValidation):
    type: Literal["min"]
    value: float


class NumberMaxValidation(BaseAnswerValidation):
    type: Literal["max"]
    value: float


class RegexValidation(BaseAnswerValidation):
    type: Literal["regex"]
    pattern: str = Field(min_length=1, max_length=MAX_REGEX_PATTERN_LENGTH)
    flags: list[Literal["i"]] = Field(default_factory=list, max_length=1)

    @field_validator("flags")
    @classmethod
    def validate_flags(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("regex flags must be unique")
        if any(flag not in SAFE_REGEX_FLAGS for flag in value):
            raise ValueError("regex flags may only contain i")
        return value

    @field_validator("pattern")
    @classmethod
    def validate_safe_pattern(cls, value: str) -> str:
        if not is_safe_regex_subset(value):
            raise ValueError(
                "regex pattern must use the safe regex subset: "
                "literals, anchors, character classes, escaped literal punctuation, "
                "regex shorthand escapes, and exact bounded repeats only"
            )
        try:
            re.compile(value)
        except re.error as exc:
            raise ValueError(f"regex pattern is invalid: {exc}") from exc
        return value


class CrossFieldValidation(BaseAnswerValidation):
    type: Literal["compare"]
    operator: Literal[
        "equals",
        "not_equals",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
    ]
    other_field_id: str = Field(alias="otherFieldId", min_length=1, max_length=64)

    @field_validator("other_field_id")
    @classmethod
    def validate_other_field_id(cls, value: str) -> str:
        return validate_field_reference(value, field_name="validation otherFieldId")


class CustomValidation(BaseAnswerValidation):
    type: Literal["custom"]
    name: str = Field(
        min_length=1,
        max_length=64,
        json_schema_extra={"enum": sorted(SUPPORTED_CUSTOM_VALIDATORS)},
    )

    @field_validator("name")
    @classmethod
    def validate_custom_validator_name(cls, value: str) -> str:
        if value not in SUPPORTED_CUSTOM_VALIDATORS:
            raise ValueError(f"Unsupported custom validator '{value}'")
        return value


AnswerValidation = Annotated[
    RequiredValidation
    | MinLengthValidation
    | MaxLengthValidation
    | NumberMinValidation
    | NumberMaxValidation
    | RegexValidation
    | CrossFieldValidation
    | CustomValidation,
    Field(discriminator="type"),
]


class LlmTool(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=255)
    prompt_template: str = Field(alias="promptTemplate", min_length=1, max_length=5000)
    target_field_id: str = Field(alias="targetFieldId", min_length=1, max_length=64)


class TemplateDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: int = Field(default=1, ge=1)
    title: str = Field(min_length=1, max_length=255)
    layout: TemplateLayout = Field(default_factory=TemplateLayout)
    fields: list[TemplateField] = Field(min_length=1)
    llm_tools: list[LlmTool] = Field(default_factory=list, alias="llmTools")
    validations: list[AnswerValidation] = Field(default_factory=list)
    visibility_rules: list[VisibilityRule] = Field(default_factory=list, alias="visibilityRules")

    @model_validator(mode="after")
    def validate_field_references(self) -> "TemplateDocument":
        field_ids = [field.id for field in self.fields]
        if len(field_ids) != len(set(field_ids)):
            raise ValueError("Field ids must be unique")

        field_id_set = set(field_ids)
        fields_by_id = {field.id: field for field in self.fields}
        answerable_field_ids = {
            field.id for field in self.fields if not isinstance(field, (ShowItemField, LlmTriggerField))
        }
        for field in self.fields:
            if isinstance(field, LlmTriggerField):
                if field.target_field_id not in answerable_field_ids:
                    raise ValueError(
                        f"llm_trigger targetFieldId '{field.target_field_id}' must reference an answerable field"
                    )
                for context_field_id in field.context_fields:
                    if context_field_id not in field_id_set:
                        raise ValueError(
                            f"llm_trigger contextFields entry '{context_field_id}' must reference an existing field"
                        )
                    if isinstance(fields_by_id[context_field_id], LlmTriggerField):
                        raise ValueError("llm_trigger contextFields cannot reference another llm_trigger field")
        for tool in self.llm_tools:
            if tool.target_field_id not in field_id_set:
                raise ValueError(f"llmTools targetFieldId '{tool.target_field_id}' must reference an existing field")
        layout_field_ids: list[str] = []
        for group in self.layout.groups:
            for field_id in group.field_ids:
                if field_id not in field_id_set:
                    raise ValueError(f"layout group '{group.id}' references unknown field '{field_id}'")
            layout_field_ids.extend(group.field_ids)
        if len(layout_field_ids) != len(set(layout_field_ids)):
            raise ValueError("layout groups cannot reference the same field more than once")
        for rule in self.visibility_rules:
            if rule.target_field_id not in field_id_set:
                raise ValueError(f"visibility rule targetFieldId '{rule.target_field_id}' must reference an existing field")
            if rule.condition.source_field_id not in answerable_field_ids:
                raise ValueError(
                    f"visibility rule sourceFieldId '{rule.condition.source_field_id}' must reference an answerable field"
                )
            if rule.target_field_id == rule.condition.source_field_id:
                raise ValueError("visibility rule targetFieldId cannot reference its sourceFieldId")
        if has_visibility_cycle(self.visibility_rules):
            raise ValueError("visibility rules cannot form a cycle")
        for validation in self.validations:
            if validation.field_id not in answerable_field_ids:
                raise ValueError(f"validation fieldId '{validation.field_id}' must reference an answerable field")
            if isinstance(validation, CrossFieldValidation) and validation.other_field_id not in answerable_field_ids:
                raise ValueError(
                    f"validation otherFieldId '{validation.other_field_id}' must reference an answerable field"
                )
        return self


class TemplateDraftRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_schema: TemplateDocument = Field(alias="schema")


class TemplateSchemaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    version: int
    title: str
    schema_payload: dict[str, Any]
    is_published: bool
    created_by: str | None
    created_at: datetime
    published_at: datetime | None


class SubmissionValidationError(ValueError):
    def __init__(self, issues: list[str]) -> None:
        self.issues = issues
        super().__init__("; ".join(issues))
