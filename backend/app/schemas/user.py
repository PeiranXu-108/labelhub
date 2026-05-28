from pydantic import BaseModel, ConfigDict

from app.domain.enums import UserRole


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: UserRole
