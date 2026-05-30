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
DEFAULT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
DEFAULT_FILE_MIME_TYPES = ["application/pdf", "text/plain"]
IMAGE_MIME_TYPES = set(DEFAULT_IMAGE_MIME_TYPES)


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


class LlmTriggerField(BaseTemplateField):
    type: Literal["llm_trigger"]
    prompt_template: str = Field(alias="promptTemplate", min_length=1, max_length=5000)
    target_field_id: str = Field(alias="targetFieldId", min_length=1, max_length=64)
    required: bool = False

    @field_validator("target_field_id")
    @classmethod
    def validate_target_field_id(cls, value: str) -> str:
        if not FIELD_ID_PATTERN.match(value):
            raise ValueError("targetFieldId must reference a stable field id")
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


class TemplateLayout(BaseModel):
    type: Literal["single"] = "single"
    groups: list[dict[str, Any]] = Field(default_factory=list)


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
    validations: list[dict[str, Any]] = Field(default_factory=list)
    visibility_rules: list[dict[str, Any]] = Field(default_factory=list, alias="visibilityRules")

    @model_validator(mode="after")
    def validate_field_references(self) -> "TemplateDocument":
        field_ids = [field.id for field in self.fields]
        if len(field_ids) != len(set(field_ids)):
            raise ValueError("Field ids must be unique")

        field_id_set = set(field_ids)
        for field in self.fields:
            if isinstance(field, LlmTriggerField) and field.target_field_id not in field_id_set:
                raise ValueError(f"llm_trigger targetFieldId '{field.target_field_id}' must reference an existing field")
        for tool in self.llm_tools:
            if tool.target_field_id not in field_id_set:
                raise ValueError(f"llmTools targetFieldId '{tool.target_field_id}' must reference an existing field")
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
