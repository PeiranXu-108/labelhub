import jwt

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.domain.enums import UserRole
from app.models import User


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
