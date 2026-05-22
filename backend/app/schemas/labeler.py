from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.submission import SubmissionRead
from app.schemas.task import TaskItemRead, TaskRead


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
