from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AgentWorkflowStepRead(BaseModel):
    key: str
    label: str
    status: str
    timestamp: datetime | None = None
    actor_role: str | None = None
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentWorkflowRead(BaseModel):
    submission_id: str
    assignment_id: str | None = None
    task_id: str
    current_status: str
    steps: list[AgentWorkflowStepRead]


class TaskAgentWorkflowSummaryRead(BaseModel):
    task_id: str
    submission_status_counts: dict[str, int]
    ai_decision_counts: dict[str, int]
    pending_count: int
    failed_count: int
    recent_workflows: list[AgentWorkflowRead]
