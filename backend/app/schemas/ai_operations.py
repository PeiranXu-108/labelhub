from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import AIReviewDecision, ReviewStage
from app.schemas.agent_workflow import AgentWorkflowRead
from app.schemas.audit import AuditLogRead
from app.schemas.submission import SubmissionRead
from app.schemas.task import TaskItemRead, TaskRead
from app.schemas.template import TemplateSchemaRead


class AIOperationRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    RETURNED = "returned"
    HUMAN_REVIEW = "human_review"
    FAILED = "failed"


class AIOperationReviewConfigRead(BaseModel):
    id: str
    task_id: str
    prompt_template: str
    criteria: list[dict[str, Any]] = Field(default_factory=list)
    pass_threshold: int
    return_threshold: int
    manual_review_threshold: int
    model_name: str
    temperature: float
    max_retries: int


class AIOperationReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    submission_id: str
    decision: AIReviewDecision
    overall_score: int
    status: str
    structured_response: dict[str, Any]
    prompt_snapshot: str | None
    model_name: str | None
    raw_provider_response: dict[str, Any] | None
    error_metadata: dict[str, Any] | None
    retry_count: int
    idempotency_key: str
    created_at: datetime


class AIOperationRunListItemRead(BaseModel):
    submission_id: str
    task_id: str
    task_name: str
    labeler_id: str
    attempt: int
    run_status: AIOperationRunStatus
    workflow_status: str
    current_stage: ReviewStage | None
    ai_decision: AIReviewDecision | None
    overall_score: int | None
    model_name: str | None
    retry_count: int
    operator_retry_count: int
    idempotency_key: str
    latest_ai_review_id: str | None
    latest_ai_review_status: str | None
    submitted_at: datetime | None
    last_run_at: datetime | None
    updated_at: datetime


class AIOperationVerdictRead(BaseModel):
    decision: AIReviewDecision | None
    summary: str | None = None
    return_reasons: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class AIOperationRunDetailRead(AIOperationRunListItemRead):
    submission: SubmissionRead
    task: TaskRead
    item: TaskItemRead
    template_schema: TemplateSchemaRead
    review_config: AIOperationReviewConfigRead
    agent_workflow: AgentWorkflowRead
    latest_ai_review: AIOperationReviewRead | None
    ai_reviews: list[AIOperationReviewRead]
    audit_logs: list[AuditLogRead]
    processing_logs: list[AuditLogRead]
    item_payload: dict[str, Any]
    answer_payload: dict[str, Any]
    score_dimensions: list[dict[str, Any]]
    verdict: AIOperationVerdictRead


class AIOperationRetryResponse(BaseModel):
    retry_performed: bool
    detail: AIOperationRunDetailRead
