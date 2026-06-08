from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.review import HumanReviewRead
from app.schemas.submission import SubmissionRead
from app.schemas.task import TaskItemRead, TaskRead
from app.schemas.template import TemplateSchemaRead


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    item_id: str
    labeler_id: str
    status: str
    claimed_at: datetime
    expires_at: datetime | None


class ClaimRead(AssignmentRead):
    item: TaskItemRead
    submission: SubmissionRead


class AssignmentDetailRead(ClaimRead):
    task: TaskRead
    template_schema: TemplateSchemaRead
    latest_human_review: HumanReviewRead | None


class AssignmentNavigationRead(BaseModel):
    assignment_id: str
    task_id: str
    previous_assignment_id: str | None
    next_assignment_id: str | None
    can_claim_next: bool
    has_previous: bool
    has_next: bool
    no_work_left: bool
    current_position: int
    total_count: int
    items: list["AssignmentNavigationItemRead"] = Field(default_factory=list)
    contribution: "AssignmentContributionRead"
    history: list["AssignmentHistoryEventRead"] = Field(default_factory=list)


class AssignmentNavigationItemRead(BaseModel):
    item_id: str
    external_id: str | None
    assignment_id: str | None
    submission_id: str | None
    labeler_id: str | None
    position: int
    status: str
    assignment_status: str | None
    is_current: bool
    is_navigable: bool
    navigation_action: Literal["open", "next"] | None


class AssignmentContributionRead(BaseModel):
    task_id: str
    labeler_id: str
    draft_count: int
    submitted_count: int
    approved_passed_count: int
    returned_rejected_count: int
    total_owned_count: int


class AssignmentHistoryEventRead(BaseModel):
    id: str
    kind: Literal["audit", "ai_review", "human_review"]
    action: str
    title: str
    summary: str | None
    actor_role: str
    from_status: str | None = None
    to_status: str | None = None
    created_at: datetime


class AssignmentNavigationMoveRead(BaseModel):
    direction: Literal["previous", "next", "skip"]
    assignment: AssignmentDetailRead | None
    navigation: AssignmentNavigationRead | None
    no_work_left: bool
    message: str
    skipped_assignment_id: str | None = None
    skip_reason: str | None = None


class SkipAssignmentRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ProblemReportRequest(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    note: str = Field(min_length=1, max_length=2000)


class ProblemReportRead(BaseModel):
    id: str
    assignment_id: str
    task_item_id: str
    labeler_id: str
    category: str
    note: str
    created_at: datetime
