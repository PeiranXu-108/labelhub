from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import Actor, api_error, require_role
from app.db.session import get_db
from app.domain.enums import UserRole
from app.schemas.upload import UploadAssetRead
from app.services.uploads import UploadError, UploadService
from app.services.workflow import ActorContext

router = APIRouter(tags=["uploads"])


def _actor_context(actor: Actor) -> ActorContext:
    return ActorContext(user_id=actor.user_id, role=actor.role)


def _raise_upload_error(exc: UploadError) -> None:
    status_code = status.HTTP_400_BAD_REQUEST
    if exc.code.endswith("_NOT_FOUND") or exc.code == "UPLOAD_FILE_MISSING":
        status_code = status.HTTP_404_NOT_FOUND
    if exc.code == "PERMISSION_DENIED":
        status_code = status.HTTP_403_FORBIDDEN
    raise api_error(exc.code, exc.message, status_code)


@router.post(
    "/labeler/assignments/{assignment_id}/uploads",
    response_model=UploadAssetRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_assignment_asset(
    assignment_id: str,
    field_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.LABELER)),
) -> UploadAssetRead:
    try:
        asset = await UploadService(db).create_assignment_upload(
            assignment_id=assignment_id,
            field_id=field_id,
            file=file,
            actor=_actor_context(actor),
        )
        return UploadAssetRead.from_asset(asset)
    except UploadError as exc:
        _raise_upload_error(exc)


@router.get("/uploads/{asset_id}/download")
def download_upload_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_role(UserRole.OWNER, UserRole.LABELER, UserRole.REVIEWER)),
) -> FileResponse:
    try:
        asset = UploadService(db).get_download_asset(asset_id, _actor_context(actor))
    except UploadError as exc:
        _raise_upload_error(exc)
    file_path = Path(asset.storage_path)
    return FileResponse(file_path, media_type=asset.content_type, filename=asset.filename)
