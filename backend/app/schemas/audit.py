from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_type: str
    entity_id: str
    action: str
    actor_id: str | None
    actor_role: str
    from_status: str | None
    to_status: str | None
    reason: str | None
    details: dict[str, Any]
    created_at: datetime
