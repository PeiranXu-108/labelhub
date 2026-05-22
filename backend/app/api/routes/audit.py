from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models import AuditLog
from app.schemas.audit import AuditLogRead

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
def query_audit_logs(
    entity_type: str | None = None,
    entity_id: str | None = None,
    db: Session = Depends(get_db),
    _actor=Depends(require_role(UserRole.OWNER, UserRole.REVIEWER)),
) -> list[AuditLog]:
    statement = select(AuditLog)
    if entity_type:
        statement = statement.where(AuditLog.entity_type == entity_type)
    if entity_id:
        statement = statement.where(AuditLog.entity_id == entity_id)
    return list(db.scalars(statement.order_by(AuditLog.created_at.desc())))
