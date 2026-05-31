from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LLMFieldAssistRequest(BaseModel):
    trigger_field_id: str = Field(min_length=1, max_length=64)
    answer_payload: dict[str, Any] = Field(default_factory=dict)


class LLMFieldAssistResponse(BaseModel):
    log_id: str
    trigger_field_id: str
    target_field_id: str
    mode: Literal["suggest", "prefill", "overwrite_with_confirmation"]
    status: Literal["succeeded"]
    value: Any
    rationale: str | None = None
    confidence: float | None = None
    model_name: str
    created_at: datetime
