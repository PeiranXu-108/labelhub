from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.domain.enums import UserRole
from app.main import app
from app.models import User


DEFAULT_TEST_USERS = {
    UserRole.OWNER: ("test-owner", "test-owner@example.com", "Test Owner"),
    UserRole.LABELER: ("test-labeler", "test-labeler@example.com", "Test Labeler"),
    UserRole.REVIEWER: ("test-reviewer", "test-reviewer@example.com", "Test Reviewer"),
}


def seed_test_user(session: Session, *, user_id: str, email: str, name: str, role: UserRole) -> User:
    user = User(
        id=user_id,
        email=email,
        name=name,
        role=role,
        password_hash=hash_password("LabelHubTest123!"),
    )
    session.add(user)
    return user


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        for role, (user_id, email, name) in DEFAULT_TEST_USERS.items():
            seed_test_user(session, user_id=user_id, email=email, name=name, role=role)
        seed_test_user(
            session,
            user_id="owner-export-api",
            email="owner-export-api@example.com",
            name="Export Owner",
            role=UserRole.OWNER,
        )
        seed_test_user(
            session,
            user_id="other-labeler",
            email="other-labeler@example.com",
            name="Other Labeler",
            role=UserRole.LABELER,
        )
        session.commit()
        yield session

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(role: UserRole, user_id: str | None = None) -> dict[str, str]:
    subject = user_id or DEFAULT_TEST_USERS.get(role, (str(uuid4()), "", ""))[0]
    token = create_access_token(subject=subject, claims={"role": role.value})
    return {"Authorization": f"Bearer {token}"}
