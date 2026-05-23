from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ExportFormat


class ExportCreate(BaseModel):
    format: ExportFormat
    field_mapping: dict[str, str] = Field(default_factory=dict)
    include_review_metadata: bool = True


class ExportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    created_by: str
    format: ExportFormat
    field_mapping: dict[str, Any]
    include_review_metadata: bool
    status: str
    file_path: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
