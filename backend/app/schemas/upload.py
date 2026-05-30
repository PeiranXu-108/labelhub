from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UploadAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    assignment_id: str | None
    submission_id: str | None
    uploader_id: str
    field_id: str
    filename: str
    content_type: str
    size_bytes: int
    download_url: str = Field(default="")
    created_at: datetime

    @classmethod
    def from_asset(cls, asset) -> "UploadAssetRead":
        return cls.model_validate(
            {
                "id": asset.id,
                "task_id": asset.task_id,
                "assignment_id": asset.assignment_id,
                "submission_id": asset.submission_id,
                "uploader_id": asset.uploader_id,
                "field_id": asset.field_id,
                "filename": asset.filename,
                "content_type": asset.content_type,
                "size_bytes": asset.size_bytes,
                "download_url": f"/uploads/{asset.id}/download",
                "created_at": asset.created_at,
            }
        )
