from pathlib import Path

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models import ExportJob
from app.schemas.export import ExportCreate, ExportJobRead
from app.services.exports import ExportError, ExportService
from app.workers.exports import enqueue_export_job

router = APIRouter(tags=["exports"])


def _is_reviewer(actor: Actor) -> bool:
    return actor.role == UserRole.REVIEWER


def _raise_export_error(exc: ExportError) -> None:
    message = str(exc)
    code = "EXPORT_ERROR"
    status_code = status.HTTP_400_BAD_REQUEST
    if "not found" in message.lower():
        code = "EXPORT_NOT_FOUND"
        status_code = status.HTTP_404_NOT_FOUND
    if "not allowed" in message.lower() or "Only the task owner" in message:
        code = "PERMISSION_DENIED"
        status_code = status.HTTP_403_FORBIDDEN
    raise api_error(code, message, status_code)


@router.post(
    "/tasks/{task_id}/exports",
    response_model=ExportJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_export_job(
    task_id: str,
    payload: ExportCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER)),
) -> ExportJob:
    try:
        job = ExportService(db).create_job(
            task_id=task_id,
            actor_id=actor.user_id,
            export_format=payload.format,
            field_mapping=payload.field_mapping,
            include_review_metadata=payload.include_review_metadata,
        )
    except ExportError as exc:
        _raise_export_error(exc)
    enqueue_export_job(job.id)
    return job


@router.get("/tasks/{task_id}/exports", response_model=list[ExportJobRead])
def list_export_jobs(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> list[ExportJob]:
    try:
        return ExportService(db).list_jobs_for_task(
            task_id=task_id,
            actor_id=actor.user_id,
            is_reviewer=_is_reviewer(actor),
        )
    except ExportError as exc:
        _raise_export_error(exc)


@router.get("/exports/{export_job_id}/download")
def download_export(
    export_job_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> FileResponse:
    job = db.get(ExportJob, export_job_id)
    if job is None:
        raise api_error("EXPORT_NOT_FOUND", "Export job was not found", status.HTTP_404_NOT_FOUND)
    if not ExportService(db).can_download(job, actor.user_id, is_reviewer=_is_reviewer(actor)):
        raise api_error(
            "PERMISSION_DENIED",
            "This role is not allowed to download the requested export",
            status.HTTP_403_FORBIDDEN,
        )
    if job.status != "succeeded" or not job.file_path:
        raise api_error("EXPORT_NOT_READY", "Export file is not ready for download", status.HTTP_409_CONFLICT)

    file_path = Path(job.file_path)
    if not file_path.exists():
        raise api_error("EXPORT_FILE_MISSING", "Export file is missing from storage", status.HTTP_404_NOT_FOUND)
    return FileResponse(file_path, filename=file_path.name)
