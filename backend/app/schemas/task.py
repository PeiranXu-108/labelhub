from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import TaskStatus


class TaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    distribution_strategy: str = "manual"
    quota_per_labeler: int | None = Field(default=None, ge=1)
    deadline_at: datetime | None = None


class TaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    quota_per_labeler: int | None = Field(default=None, ge=1)
    deadline_at: datetime | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    status: TaskStatus
    distribution_strategy: str
    quota_per_labeler: int | None
    deadline_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class ItemImportEntry(BaseModel):
    external_id: str | None = None
    payload: dict[str, Any]


class ItemImportRequest(BaseModel):
    items: list[ItemImportEntry] = Field(min_length=1)


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
