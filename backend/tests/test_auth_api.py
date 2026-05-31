from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import jwt
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.domain.enums import UserRole
from app.models import User
from scripts import seed_e2e_data


def seed_user(db_session, *, email: str, password: str, role: UserRole, user_id: str = "auth-user") -> User:
    user = User(
        id=user_id,
        email=email,
        name=email.split("@")[0].title(),
        role=role,
    )
    user.password_hash = hash_password(password)
    db_session.add(user)
    db_session.commit()
    return user


def test_login_returns_bearer_token_and_user_summary(client, db_session) -> None:
    user = seed_user(
        db_session,
        email="owner@example.com",
        password="LabelHubOwner123!",
        role=UserRole.OWNER,
        user_id="owner-login",
    )

    response = client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "LabelHubOwner123!"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["user"] == {
        "id": user.id,
        "email": "owner@example.com",
        "name": "Owner",
        "role": "owner",
    }

    token_payload = jwt.decode(
        payload["access_token"],
        get_settings().jwt_secret_key,
        algorithms=[get_settings().jwt_algorithm],
    )
    assert token_payload["sub"] == user.id
    assert token_payload["role"] == "owner"


def test_login_rejects_invalid_credentials_without_user_leak(client, db_session) -> None:
    seed_user(
        db_session,
        email="labeler@example.com",
        password="LabelHubLabeler123!",
        role=UserRole.LABELER,
        user_id="labeler-login",
    )

    bad_password = client.post(
        "/auth/login",
        json={"email": "labeler@example.com", "password": "wrong-password"},
    )
    missing_email = client.post(
        "/auth/login",
        json={"email": "missing@example.com", "password": "LabelHubLabeler123!"},
    )

    assert bad_password.status_code == 401
    assert missing_email.status_code == 401
    assert bad_password.json()["detail"] == missing_email.json()["detail"]


def test_auth_me_returns_persisted_current_user(client, db_session) -> None:
    user = seed_user(
        db_session,
        email="reviewer@example.com",
        password="LabelHubReviewer123!",
        role=UserRole.REVIEWER,
        user_id="reviewer-login",
    )
    token = create_access_token(subject=user.id, claims={"role": user.role.value})

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "id": user.id,
        "email": "reviewer@example.com",
        "name": "Reviewer",
        "role": "reviewer",
    }


def test_auth_me_rejects_missing_invalid_and_unknown_tokens(client, db_session) -> None:
    seed_user(
        db_session,
        email="owner@example.com",
        password="LabelHubOwner123!",
        role=UserRole.OWNER,
        user_id="known-owner",
    )
    unknown_token = create_access_token(subject="unknown-user", claims={"role": "owner"})

    missing = client.get("/auth/me")
    invalid = client.get("/auth/me", headers={"Authorization": "Bearer not-a-token"})
    unknown = client.get("/auth/me", headers={"Authorization": f"Bearer {unknown_token}"})

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert unknown.status_code == 401
    assert db_session.get(User, "unknown-user") is None


def test_role_mismatch_between_token_and_user_fails_closed(client, db_session) -> None:
    user = seed_user(
        db_session,
        email="labeler@example.com",
        password="LabelHubLabeler123!",
        role=UserRole.LABELER,
        user_id="role-mismatch-user",
    )
    token = create_access_token(subject=user.id, claims={"role": "owner"})

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    db_session.refresh(user)
    assert user.role == UserRole.LABELER


def test_seeded_owner_token_can_use_role_protected_business_route(client, db_session) -> None:
    user = seed_user(
        db_session,
        email="owner@example.com",
        password="LabelHubOwner123!",
        role=UserRole.OWNER,
        user_id="owner-business-route",
    )
    token = create_access_token(subject=user.id, claims={"role": user.role.value})

    response = client.post(
        "/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Auth-protected task",
            "description": "Created through a seeded persisted user token.",
            "distribution_strategy": "manual",
        },
    )

    assert response.status_code == 201
    assert response.json()["created_by"] == user.id


def test_seed_demo_users_is_idempotent_and_parallel_safe(tmp_path, monkeypatch) -> None:
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'seed-demo-users.sqlite'}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(seed_e2e_data, "SessionLocal", TestingSessionLocal)
    insert_barrier = Barrier(4)
    force_insert_overlap = False

    @event.listens_for(engine, "before_cursor_execute")
    def force_parallel_owner_insert(conn, cursor, statement, parameters, context, executemany) -> None:
        if not force_insert_overlap:
            return
        if "INSERT INTO users" not in statement:
            return
        if isinstance(parameters, tuple) and parameters and parameters[0] == "e2e-owner":
            insert_barrier.wait(timeout=5)

    try:
        first = seed_e2e_data.seed_demo_users()
        second = seed_e2e_data.seed_demo_users()

        assert first == second

        with TestingSessionLocal() as session:
            session.query(User).delete()
            session.commit()

        force_insert_overlap = True
        with ThreadPoolExecutor(max_workers=4) as executor:
            token_payloads = list(executor.map(lambda _: seed_e2e_data.build_tokens(), range(8)))

        assert all(set(payload) == {"owner", "labeler", "reviewer"} for payload in token_payloads)
        with TestingSessionLocal() as session:
            demo_emails = [spec["email"] for spec in seed_e2e_data.DEMO_USERS.values()]
            user_count = session.scalar(select(func.count()).select_from(User).where(User.email.in_(demo_emails)))
            assert user_count == 3
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
