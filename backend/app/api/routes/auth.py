from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import api_error, get_current_user
from app.core.security import create_access_token
from app.db.session import get_db
from app.models import User
from app.schemas.auth import LoginRequest, LoginResponse
from app.schemas.user import UserSummary
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = AuthService(db).authenticate(payload.email, payload.password)
    if user is None:
        raise api_error(
            "INVALID_CREDENTIALS",
            "Invalid email or password",
            status.HTTP_401_UNAUTHORIZED,
        )

    return LoginResponse(
        access_token=create_access_token(subject=user.id, claims={"role": user.role.value}),
        user=user,
    )


@router.get("/me", response_model=UserSummary)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
