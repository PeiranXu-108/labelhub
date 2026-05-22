from pydantic import BaseModel, Field

from app.schemas.submission import SubmissionRead
from app.schemas.task import TaskItemRead, TaskRead


class ReviewActionRequest(BaseModel):
    reason: str = Field(min_length=1)


class BatchReviewRequest(BaseModel):
    submission_ids: list[str] = Field(min_length=1)
    action: str = Field(pattern="^(approve|return)$")
    reason: str | None = None


class ReviewSubmissionDetail(BaseModel):
    submission: SubmissionRead
    task: TaskRead
    item: TaskItemRead
