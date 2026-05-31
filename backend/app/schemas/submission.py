from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ReviewStage, SubmissionStatus


class DraftSaveRequest(BaseModel):
    answer_payload: dict[str, Any] = Field(default_factory=dict)


class SubmitRequest(BaseModel):
    answer_payload: dict[str, Any] = Field(default_factory=dict)


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    item_id: str
    assignment_id: str | None
    labeler_id: str
    template_schema_id: str
    schema_version: int
    answer_payload: dict[str, Any]
    status: SubmissionStatus
    review_stage: ReviewStage | None
    attempt: int
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime
