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
