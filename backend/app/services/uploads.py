from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.domain.enums import SubmissionStatus, UserRole
from app.models import Assignment, AuditLog, Submission, Task, UploadAsset
from app.schemas.template import FileUploadField, ImageUploadField, TemplateDocument
from app.storage import LocalUploadStorage
from app.services.workflow import ActorContext


class UploadError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class UploadService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.storage = LocalUploadStorage(get_settings().upload_storage_path)

    async def create_assignment_upload(
        self,
        *,
        assignment_id: str,
        field_id: str,
        file: UploadFile,
        actor: ActorContext,
    ) -> UploadAsset:
        assignment = self.db.query(Assignment).options(
            joinedload(Assignment.submission).joinedload(Submission.template_schema)
        ).filter(Assignment.id == assignment_id).one_or_none()
        if assignment is None:
            raise UploadError("ASSIGNMENT_NOT_FOUND", "Assignment was not found")
        if assignment.labeler_id != actor.user_id:
            raise UploadError("PERMISSION_DENIED", "Labeler does not own this assignment")
        submission = assignment.submission
        if submission.status not in {
            SubmissionStatus.DRAFT,
            SubmissionStatus.RETURNED,
            SubmissionStatus.AI_RETURNED,
        }:
            raise UploadError("INVALID_UPLOAD_STATE", "Only draft or returned submissions accept uploads")

        upload_field = self._field_for_upload(submission, field_id)
        filename = _safe_filename(file.filename)
        content_type = (file.content_type or "application/octet-stream").lower()
        content = await file.read()
        self._validate_file_constraints(upload_field, filename, content_type, len(content))

        asset_id = str(uuid4())
        storage_path = self.storage.write_asset(
            task_id=assignment.task_id,
            assignment_id=assignment.id,
            asset_id=asset_id,
            filename=filename,
            content=content,
        )
        asset = UploadAsset(
            id=asset_id,
            task_id=assignment.task_id,
            assignment_id=assignment.id,
            submission_id=submission.id,
            uploader_id=actor.user_id,
            field_id=field_id,
            filename=filename,
            stored_filename=storage_path.name,
            content_type=content_type,
            size_bytes=len(content),
            storage_path=str(storage_path),
        )
        self.db.add(asset)
        self.db.flush()
        self._audit(asset, actor)
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def get_download_asset(self, asset_id: str, actor: ActorContext) -> UploadAsset:
        asset = self.db.get(UploadAsset, asset_id)
        if asset is None:
            raise UploadError("UPLOAD_NOT_FOUND", "Upload asset was not found")
        if not self.can_download(asset, actor):
            raise UploadError("PERMISSION_DENIED", "This role is not allowed to download the requested upload")
        if not Path(asset.storage_path).exists():
            raise UploadError("UPLOAD_FILE_MISSING", "Upload file is missing from storage")
        return asset

    def can_download(self, asset: UploadAsset, actor: ActorContext) -> bool:
        if actor.role == UserRole.REVIEWER:
            return True
        if actor.role == UserRole.LABELER:
            return asset.uploader_id == actor.user_id
        if actor.role == UserRole.OWNER:
            task = self.db.get(Task, asset.task_id)
            return bool(task and task.created_by == actor.user_id)
        return False

    def _field_for_upload(self, submission: Submission, field_id: str) -> ImageUploadField | FileUploadField:
        schema = TemplateDocument.model_validate(submission.template_schema.schema_payload)
        for field in schema.fields:
            if field.id == field_id and isinstance(field, (ImageUploadField, FileUploadField)):
                return field
        raise UploadError("INVALID_UPLOAD_FIELD", f"Field '{field_id}' is not an upload field")

    def _validate_file_constraints(
        self,
        field: ImageUploadField | FileUploadField,
        filename: str,
        content_type: str,
        size_bytes: int,
    ) -> None:
        if size_bytes > field.max_file_size_bytes:
            raise UploadError(
                "INVALID_UPLOAD_FILE",
                f"File '{filename}' exceeds the {field.max_file_size_bytes} byte limit for field '{field.id}'",
            )
        if content_type not in field.accepted_mime_types:
            raise UploadError(
                "INVALID_UPLOAD_FILE",
                f"Content type '{content_type}' is not allowed for field '{field.id}'",
            )
        if isinstance(field, ImageUploadField):
            return
        extension = Path(filename).suffix.lower()
        if field.accepted_extensions and extension not in field.accepted_extensions:
            raise UploadError(
                "INVALID_UPLOAD_FILE",
                f"File extension '{extension or '(none)'}' is not allowed for field '{field.id}'",
            )

    def _audit(self, asset: UploadAsset, actor: ActorContext) -> None:
        self.db.add(
            AuditLog(
                entity_type="upload_asset",
                entity_id=asset.id,
                action="upload",
                actor_id=actor.user_id,
                actor_role=actor.role.value,
                details={
                    "task_id": asset.task_id,
                    "assignment_id": asset.assignment_id,
                    "submission_id": asset.submission_id,
                    "field_id": asset.field_id,
                    "filename": asset.filename,
                    "size_bytes": asset.size_bytes,
                },
            )
        )
        self.db.flush()


def _safe_filename(filename: str | None) -> str:
    basename = Path(filename or "upload.bin").name.strip()
    if not basename:
        return "upload.bin"
    cleaned = "".join(character for character in basename if character.isprintable())
    return cleaned[:255] or "upload.bin"
