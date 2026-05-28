from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.domain.enums import UserRole
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Actor:
    user_id: str
    role: UserRole


def api_error(code: str, message: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=http_status, detail={"code": code, "message": message})


def get_current_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Actor:
    user = get_current_user(credentials, db)
    return Actor(user_id=user.id, role=user.role)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise api_error("UNAUTHENTICATED", "Missing bearer token", status.HTTP_401_UNAUTHORIZED)

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError as exc:
        raise api_error("UNAUTHENTICATED", "Invalid bearer token", status.HTTP_401_UNAUTHORIZED) from exc

    subject = payload.get("sub")
    role_value = payload.get("role")
    if not subject or not role_value:
        raise api_error("UNAUTHENTICATED", "Token must include sub and role", status.HTTP_401_UNAUTHORIZED)

    try:
        role = UserRole(role_value)
    except ValueError as exc:
        raise api_error("UNAUTHENTICATED", "Token role is not supported", status.HTTP_401_UNAUTHORIZED) from exc

    user = db.scalar(select(User).where(User.id == subject))
    if user is None:
        raise api_error("UNAUTHENTICATED", "Token subject is not a persisted user", status.HTTP_401_UNAUTHORIZED)
    if user.role != role:
        raise api_error("UNAUTHENTICATED", "Token role does not match persisted user", status.HTTP_401_UNAUTHORIZED)

    return user


def require_role(*roles: UserRole):
    def dependency(actor: Actor = Depends(get_current_actor)) -> Actor:
        if actor.role not in roles:
            raise api_error(
                "PERMISSION_DENIED",
                "This role is not allowed to perform the requested action",
                status.HTTP_403_FORBIDDEN,
            )
        return actor

    return dependency
