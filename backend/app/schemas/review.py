from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import AIReviewDecision
from app.schemas.agent_workflow import AgentWorkflowRead
from app.schemas.audit import AuditLogRead
from app.schemas.submission import SubmissionRead
from app.schemas.task import TaskItemRead, TaskRead
from app.schemas.template import TemplateSchemaRead


class ReviewActionRequest(BaseModel):
    reason: str = Field(min_length=1)


class BatchReviewRequest(BaseModel):
    submission_ids: list[str] = Field(min_length=1)
    action: str = Field(pattern="^(approve|return)$")
    reason: str | None = None


class AIReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    submission_id: str
    decision: AIReviewDecision
    overall_score: int
    status: str
    structured_response: dict[str, Any]
    prompt_snapshot: str | None
    model_name: str | None
    created_at: datetime


class HumanReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    submission_id: str
    reviewer_id: str
    decision: str
    reason: str | None
    review_metadata: dict[str, Any]
    created_at: datetime


class SubmissionAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    submission_id: str
    attempt: int
    template_schema_id: str
    schema_version: int
    answer_payload: dict[str, Any]
    submitted_at: datetime
    created_at: datetime


class ReviewQueueItemRead(BaseModel):
    submission: SubmissionRead
    task: TaskRead
    latest_ai_review: AIReviewRead | None
    latest_human_review: HumanReviewRead | None


class ReviewSubmissionDetail(BaseModel):
    submission: SubmissionRead
    task: TaskRead
    item: TaskItemRead
    template_schema: TemplateSchemaRead
    agent_workflow: AgentWorkflowRead
    ai_reviews: list[AIReviewRead]
    human_reviews: list[HumanReviewRead]
    audit_logs: list[AuditLogRead]
    previous_attempts: list[SubmissionAttemptRead]
