from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import AIReviewDecision, ReviewStage
from app.schemas.agent_workflow import AgentWorkflowRead
from app.schemas.audit import AuditLogRead
from app.schemas.submission import SubmissionRead
from app.schemas.task import TaskItemRead, TaskRead
from app.schemas.template import TemplateSchemaRead


class ReviewActionRequest(BaseModel):
    stage: ReviewStage | None = None
    reason: str | None = Field(default=None, min_length=1)


class BatchReviewRequest(BaseModel):
    submission_ids: list[str] = Field(min_length=1)
    action: str = Field(pattern="^(approve|return)$")
    stage: ReviewStage | None = None
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
    stage: ReviewStage
    round: int
    compared_from_attempt: int | None
    compared_to_attempt: int | None
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
    current_stage: ReviewStage | None
    latest_ai_review: AIReviewRead | None
    latest_human_review: HumanReviewRead | None


class ReviewerSLAContextRead(BaseModel):
    source: str
    reference_time: datetime
    nearest_deadline_at: datetime | None
    seconds_until_nearest_deadline: int | None
    overdue_count: int
    pending_with_deadline_count: int


class ReviewerMetricsRead(BaseModel):
    reviewed_today: int
    approved_today: int
    returned_today: int
    pass_rate: float | None
    pending_review_count: int
    sla: ReviewerSLAContextRead


class ReviewRoundDiffFieldRead(BaseModel):
    field_id: str
    field_label: str
    change_type: str
    from_value: Any | None = None
    to_value: Any | None = None


class ReviewRoundDiffRead(BaseModel):
    from_attempt: int
    to_attempt: int
    fields: list[ReviewRoundDiffFieldRead]


class ReviewSubmissionDetail(BaseModel):
    submission: SubmissionRead
    task: TaskRead
    item: TaskItemRead
    template_schema: TemplateSchemaRead
    agent_workflow: AgentWorkflowRead
    current_stage: ReviewStage | None
    ai_reviews: list[AIReviewRead]
    human_reviews: list[HumanReviewRead]
    stage_history: list[HumanReviewRead]
    round_diffs: list[ReviewRoundDiffRead]
    audit_logs: list[AuditLogRead]
    previous_attempts: list[SubmissionAttemptRead]


class ReviewAuditExportSubmissionRead(BaseModel):
    submission: SubmissionRead
    task: TaskRead
    audit_logs: list[AuditLogRead]
    ai_reviews: list[AIReviewRead]
    human_reviews: list[HumanReviewRead]


class ReviewAuditExportRead(BaseModel):
    scope: str
    task_id: str
    generated_at: datetime
    submission_count: int
    submissions: list[ReviewAuditExportSubmissionRead]
