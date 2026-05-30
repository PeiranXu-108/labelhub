from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.domain.enums import UserRole
from tests.conftest import auth_headers


def _media_schema(*, max_file_size: int = 16) -> dict:
    return {
        "version": 1,
        "title": "Upload template",
        "layout": {"type": "single", "groups": []},
        "fields": [
            {
                "id": "source",
                "type": "show_item",
                "label": "Source",
                "source": "item.payload.text",
            },
            {
                "id": "rationale",
                "type": "rich_text",
                "label": "Rationale",
                "required": True,
                "minLength": 3,
                "maxLength": 200,
            },
            {
                "id": "screenshots",
                "type": "image_upload",
                "label": "Screenshots",
                "required": True,
                "acceptedMimeTypes": ["image/png"],
                "maxFileSizeBytes": max_file_size,
                "maxCount": 2,
            },
            {
                "id": "attachments",
                "type": "file_upload",
                "label": "Attachments",
                "acceptedMimeTypes": ["text/plain"],
                "acceptedExtensions": [".txt"],
                "maxFileSizeBytes": max_file_size,
                "maxCount": 1,
            },
        ],
        "llmTools": [],
        "validations": [],
        "visibilityRules": [],
    }


@pytest.fixture()
def upload_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setenv("LABELHUB_UPLOAD_STORAGE_PATH", str(tmp_path))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


def _create_assignment(client: TestClient, *, schema: dict | None = None) -> tuple[dict, dict]:
    owner_headers = auth_headers(UserRole.OWNER)
    labeler_headers = auth_headers(UserRole.LABELER)
    task = client.post("/tasks", headers=owner_headers, json={"name": "Upload task"}).json()
    client.post(
        f"/tasks/{task['id']}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "hello"}}]},
    )
    client.post(
        f"/tasks/{task['id']}/template/draft",
        headers=owner_headers,
        json={"schema": schema or _media_schema()},
    )
    client.post(f"/tasks/{task['id']}/template/publish", headers=owner_headers)
    client.post(f"/tasks/{task['id']}/publish", headers=owner_headers)
    assignment = client.post(f"/labeler/tasks/{task['id']}/claim", headers=labeler_headers).json()
    return task, assignment


def test_upload_endpoint_rejects_unauthenticated_users(client: TestClient, upload_storage: Path) -> None:
    response = client.post(
        "/labeler/assignments/assignment-1/uploads",
        data={"field_id": "screenshots"},
        files={"file": ("shot.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHENTICATED"


def test_labeler_upload_stores_public_metadata_and_download_permissions(
    client: TestClient,
    upload_storage: Path,
) -> None:
    task, assignment = _create_assignment(client)
    labeler_headers = auth_headers(UserRole.LABELER)

    upload_response = client.post(
        f"/labeler/assignments/{assignment['id']}/uploads",
        headers=labeler_headers,
        data={"field_id": "screenshots"},
        files={"file": ("shot.png", b"image-bytes", "image/png")},
    )

    assert upload_response.status_code == 201
    asset = upload_response.json()
    assert asset["task_id"] == task["id"]
    assert asset["assignment_id"] == assignment["id"]
    assert asset["field_id"] == "screenshots"
    assert asset["filename"] == "shot.png"
    assert asset["content_type"] == "image/png"
    assert asset["size_bytes"] == len(b"image-bytes")
    assert asset["download_url"] == f"/uploads/{asset['id']}/download"
    assert "storage_path" not in asset
    assert "stored_filename" not in asset
    assert list(upload_storage.rglob("*.png"))

    denied_response = client.get(
        asset["download_url"],
        headers=auth_headers(UserRole.LABELER, user_id="other-labeler"),
    )
    assert denied_response.status_code == 403
    assert denied_response.json()["detail"]["code"] == "PERMISSION_DENIED"

    reviewer_response = client.get(asset["download_url"], headers=auth_headers(UserRole.REVIEWER))
    assert reviewer_response.status_code == 200
    assert reviewer_response.content == b"image-bytes"


def test_upload_endpoint_enforces_field_type_and_size_constraints(
    client: TestClient,
    upload_storage: Path,
) -> None:
    _, assignment = _create_assignment(client, schema=_media_schema(max_file_size=4))
    labeler_headers = auth_headers(UserRole.LABELER)

    wrong_type = client.post(
        f"/labeler/assignments/{assignment['id']}/uploads",
        headers=labeler_headers,
        data={"field_id": "screenshots"},
        files={"file": ("shot.jpg", b"jpg", "image/jpeg")},
    )
    too_large = client.post(
        f"/labeler/assignments/{assignment['id']}/uploads",
        headers=labeler_headers,
        data={"field_id": "screenshots"},
        files={"file": ("shot.png", b"12345", "image/png")},
    )

    assert wrong_type.status_code == 400
    assert wrong_type.json()["detail"]["code"] == "INVALID_UPLOAD_FILE"
    assert "not allowed for field 'screenshots'" in wrong_type.json()["detail"]["message"]
    assert too_large.status_code == 400
    assert too_large.json()["detail"]["code"] == "INVALID_UPLOAD_FILE"
    assert "exceeds the 4 byte limit" in too_large.json()["detail"]["message"]


def test_submission_normalizes_rich_text_and_upload_metadata(
    client: TestClient,
    upload_storage: Path,
) -> None:
    _, assignment = _create_assignment(client)
    labeler_headers = auth_headers(UserRole.LABELER)
    upload_response = client.post(
        f"/labeler/assignments/{assignment['id']}/uploads",
        headers=labeler_headers,
        data={"field_id": "screenshots"},
        files={"file": ("shot.png", b"image-bytes", "image/png")},
    )
    asset = upload_response.json()

    response = client.post(
        f"/labeler/assignments/{assignment['id']}/submit",
        headers=labeler_headers,
        json={
            "answer_payload": {
                "rationale": {
                    "format": "markdown",
                    "content": "**Good** evidence",
                    "plainText": "client value is ignored",
                },
                "screenshots": [{"assetId": asset["id"], "filename": "spoofed.png"}],
            }
        },
    )

    assert response.status_code == 200
    answers = response.json()["answer_payload"]
    assert answers["rationale"] == {
        "format": "markdown",
        "content": "**Good** evidence",
        "plainText": "Good evidence",
    }
    assert answers["screenshots"] == [
        {
            "assetId": asset["id"],
            "filename": "shot.png",
            "contentType": "image/png",
            "sizeBytes": len(b"image-bytes"),
            "downloadUrl": f"/uploads/{asset['id']}/download",
        }
    ]
