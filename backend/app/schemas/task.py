from datetime import datetime
from decimal import Decimal
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from app.domain.enums import TaskStatus


UNSAFE_RICH_TEXT_PATTERNS = [
    re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>"),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"data\s*:\s*text/html", re.IGNORECASE),
    re.compile(r"\bon[a-z]+\s*=", re.IGNORECASE),
]
MARKDOWN_CONTROL_RE = re.compile(r"[*_`>#\-\[\]\(\)!]+")
WHITESPACE_RE = re.compile(r"\s+")


class InstructionRichText(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["markdown"] = "markdown"
    content: str = Field(min_length=1, max_length=20_000)

    @field_validator("content")
    @classmethod
    def strip_and_reject_unsafe_content(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("instruction content cannot be empty")
        if any(pattern.search(content) for pattern in UNSAFE_RICH_TEXT_PATTERNS):
            raise ValueError("instruction rich text contains unsafe markup")
        return content


class RewardRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["none", "fixed_per_accepted_submission", "manual"] = "none"
    currency: str | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=2_000)

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: Any) -> str | None:
        if value is None:
            return None
        currency = str(value).strip().upper()
        if not currency:
            return None
        if not re.fullmatch(r"[A-Z]{3}", currency):
            raise ValueError("reward currency must be a 3-letter ISO code")
        return currency

    @field_validator("amount", mode="before")
    @classmethod
    def normalize_amount(cls, value: Any) -> Any:
        if value == "":
            return None
        return value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: Any) -> str | None:
        return normalize_plain_text(value)

    @model_validator(mode="after")
    def validate_mode_fields(self) -> "RewardRule":
        if self.mode == "none":
            if self.currency is not None or self.amount is not None:
                raise ValueError("currency and amount require a reward mode")
            return self

        if self.currency is None:
            raise ValueError("currency is required when reward mode is not none")

        if self.mode == "fixed_per_accepted_submission":
            if self.amount is None:
                raise ValueError("amount is required for fixed per accepted submission rewards")
            if self.amount <= 0:
                raise ValueError("amount must be greater than zero for fixed rewards")
            return self

        if self.amount is not None:
            raise ValueError("amount is only allowed for fixed per accepted submission rewards")
        return self

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class QualityRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2_000)

    @field_validator("label", "description")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("quality rule text cannot be empty")
        return stripped


def default_reward_rule() -> RewardRule:
    return RewardRule()


def normalize_tags(value: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_tag in value:
        tag = WHITESPACE_RE.sub(" ", raw_tag.strip()).casefold()
        if not tag:
            raise ValueError("tags cannot contain empty values")
        if tag in seen:
            raise ValueError("tags must be unique after normalization")
        seen.add(tag)
        normalized.append(tag)
    return normalized


def normalize_plain_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("text value must be a string")
    normalized = WHITESPACE_RE.sub(" ", value.strip())
    return normalized or None


def derive_instruction_plain_text(instruction: InstructionRichText | None) -> str | None:
    if instruction is None:
        return None
    without_markdown = MARKDOWN_CONTROL_RE.sub(" ", instruction.content)
    normalized = normalize_plain_text(without_markdown)
    return re.sub(r"\s+([.,;:!?])", r"\1", normalized) if normalized else None


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    instruction_rich_text: InstructionRichText | None = None
    instruction_plain_text: str | None = Field(default=None, max_length=20_000)
    tags: list[str] = Field(default_factory=list, max_length=20)
    reward_rule: RewardRule = Field(default_factory=default_reward_rule)
    quality_rules: list[QualityRule] = Field(default_factory=list, max_length=20)
    distribution_strategy: str = "manual"
    quota_per_labeler: int | None = Field(default=None, ge=1)
    deadline_at: datetime | None = None

    @field_validator("description", "instruction_plain_text", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Any) -> str | None:
        return normalize_plain_text(value)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return normalize_tags(value)

    def to_task_data(self) -> dict[str, Any]:
        data = self.model_dump(mode="json")
        data["instruction_plain_text"] = (
            derive_instruction_plain_text(self.instruction_rich_text)
            or normalize_plain_text(self.instruction_plain_text)
        )
        return data


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    instruction_rich_text: InstructionRichText | None = None
    instruction_plain_text: str | None = Field(default=None, max_length=20_000)
    tags: list[str] | None = Field(default=None, max_length=20)
    reward_rule: RewardRule | None = None
    quality_rules: list[QualityRule] | None = Field(default=None, max_length=20)
    quota_per_labeler: int | None = Field(default=None, ge=1)
    deadline_at: datetime | None = None

    @field_validator("description", "instruction_plain_text", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Any) -> str | None:
        return normalize_plain_text(value)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        return normalize_tags(value) if value is not None else None

    def to_update_data(self) -> dict[str, Any]:
        data = self.model_dump(mode="json", exclude_unset=True)
        if "instruction_rich_text" in self.model_fields_set:
            data["instruction_plain_text"] = derive_instruction_plain_text(self.instruction_rich_text)
        elif "instruction_plain_text" in self.model_fields_set:
            data["instruction_plain_text"] = normalize_plain_text(self.instruction_plain_text)
        return data


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    instruction_rich_text: InstructionRichText | None = None
    instruction_plain_text: str | None = None
    tags: list[str] = Field(default_factory=list)
    reward_rule: RewardRule = Field(default_factory=default_reward_rule)
    quality_rules: list[QualityRule] = Field(default_factory=list)
    status: TaskStatus
    distribution_strategy: str
    quota_per_labeler: int | None
    deadline_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class ItemImportEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str | None = None
    payload: dict[str, Any]
    source_row: int | None = Field(default=None, ge=1)


class ItemImportRequest(BaseModel):
    items: list[ItemImportEntry] = Field(min_length=1)


class ExcelImportMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id_column: str = "external_id"
    payload_column: str | None = "payload"
    payload_columns: list[str] | None = None


class ItemImportPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["json_array", "jsonl", "xlsx"]
    content: str = Field(min_length=1)
    filename: str | None = None
    is_base64: bool = False
    excel_mapping: ExcelImportMapping = Field(default_factory=ExcelImportMapping)


class ImportRowIssue(BaseModel):
    row_number: int | None = None
    field: str | None = None
    code: str
    message: str


class ImportPreviewRow(BaseModel):
    row_number: int
    external_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    errors: list[ImportRowIssue] = Field(default_factory=list)
    warnings: list[ImportRowIssue] = Field(default_factory=list)


class ImportLimitsRead(BaseModel):
    max_rows: int
    max_file_bytes: int


class ItemImportPreviewResponse(BaseModel):
    rows: list[ImportPreviewRow]
    errors: list[ImportRowIssue] = Field(default_factory=list)
    valid_count: int
    invalid_count: int
    limits: ImportLimitsRead


class TaskItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    external_id: str | None
    payload: dict[str, Any]
    status: str
    created_at: datetime


class ReviewConfigUpsert(BaseModel):
    prompt_template: str = ""
    criteria: list[dict[str, Any]] = Field(default_factory=list)
    pass_threshold: int = Field(default=80, ge=0, le=100)
    return_threshold: int = Field(default=40, ge=0, le=100)
    manual_review_threshold: int = Field(default=60, ge=0, le=100)
    model_name: str = "deepseek-chat"
    temperature: float = Field(default=0.0, ge=0, le=2)
    max_retries: int = Field(default=2, ge=0, le=10)


class ReviewConfigRead(ReviewConfigUpsert):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    created_at: datetime
    updated_at: datetime
