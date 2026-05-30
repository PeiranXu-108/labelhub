from __future__ import annotations

import base64
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import UserRole
from app.models import TaskItem
from tests.conftest import auth_headers


def test_json_array_preview_and_commit_succeeds(client: TestClient) -> None:
    task = create_task(client)
    headers = auth_headers(UserRole.OWNER)

    preview = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=headers,
        json={
            "format": "json_array",
            "content": '[{"external_id":"json-row","payload":{"text":"from paste"}}]',
        },
    )

    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["valid_count"] == 1
    response = client.post(
        f"/tasks/{task['id']}/items/import",
        headers=headers,
        json={
            "items": [
                {
                    "external_id": preview_body["rows"][0]["external_id"],
                    "payload": preview_body["rows"][0]["payload"],
                    "source_row": preview_body["rows"][0]["row_number"],
                }
            ]
        },
    )

    assert response.status_code == 201
    assert response.json()[0]["external_id"] == "json-row"
    assert response.json()[0]["payload"] == {"text": "from paste"}


def test_empty_json_array_and_jsonl_are_rejected_in_preview(client: TestClient) -> None:
    task = create_task(client)
    headers = auth_headers(UserRole.OWNER)

    empty_array = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=headers,
        json={"format": "json_array", "content": "[]"},
    )
    empty_jsonl = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=headers,
        json={"format": "jsonl", "content": "\n"},
    )

    assert empty_array.status_code == 200
    assert empty_array.json()["errors"][0]["code"] == "EMPTY_IMPORT"
    assert empty_jsonl.status_code == 200
    assert empty_jsonl.json()["errors"][0]["code"] == "EMPTY_IMPORT"


def test_preview_jsonl_reports_invalid_line_number(client: TestClient) -> None:
    task = create_task(client)

    response = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=auth_headers(UserRole.OWNER),
        json={
            "format": "jsonl",
            "content": '{"external_id":"row-1","payload":{"text":"one"}}\n{"external_id":',
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["valid_count"] == 1
    assert body["invalid_count"] == 1
    assert body["rows"][0]["external_id"] == "row-1"
    assert body["errors"][0]["row_number"] == 2
    assert body["errors"][0]["field"] == "line"
    assert "Invalid JSON" in body["errors"][0]["message"]


def test_preview_xlsx_maps_columns_to_payload(client: TestClient) -> None:
    task = create_task(client)
    workbook = build_xlsx(
        [
            ["external_id", "text", "score"],
            ["row-1", "Support answer", 5],
        ]
    )

    response = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=auth_headers(UserRole.OWNER),
        json={
            "format": "xlsx",
            "content": base64.b64encode(workbook).decode("ascii"),
            "is_base64": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["valid_count"] == 1
    assert body["invalid_count"] == 0
    assert body["rows"][0]["row_number"] == 2
    assert body["rows"][0]["external_id"] == "row-1"
    assert body["rows"][0]["payload"] == {"text": "Support answer", "score": 5}


def test_preview_xlsx_payload_json_column_is_explicit_mapping(client: TestClient) -> None:
    task = create_task(client)
    workbook = build_xlsx(
        [
            ["external_id", "payload", "ignored"],
            ["row-2", '{"text":"JSON payload","nested":{"source":"sheet"}}', "not imported"],
        ]
    )

    response = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=auth_headers(UserRole.OWNER),
        json={
            "format": "xlsx",
            "content": base64.b64encode(workbook).decode("ascii"),
            "is_base64": True,
            "excel_mapping": {"payload_column": "payload"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["valid_count"] == 1
    assert body["rows"][0]["payload"] == {"text": "JSON payload", "nested": {"source": "sheet"}}


def test_import_duplicate_external_id_rejects_whole_batch_with_row_context(
    client: TestClient,
    db_session: Session,
) -> None:
    task = create_task(client)
    headers = auth_headers(UserRole.OWNER)
    first = client.post(
        f"/tasks/{task['id']}/items/import",
        headers=headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )
    assert first.status_code == 201

    response = client.post(
        f"/tasks/{task['id']}/items/import",
        headers=headers,
        json={
            "items": [
                {"external_id": " row-1 ", "payload": {"text": "duplicate"}, "source_row": 7},
                {"external_id": "row-2", "payload": {"text": "should not persist"}, "source_row": 8},
            ]
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "INVALID_ITEM_IMPORT"
    assert "row 7" in response.json()["detail"]["message"]
    assert "already exists" in response.json()["detail"]["message"]
    persisted = db_session.scalars(select(TaskItem).where(TaskItem.task_id == task["id"])).all()
    assert [item.external_id for item in persisted] == ["row-1"]


def test_import_batch_duplicate_external_id_reports_both_rows(client: TestClient) -> None:
    task = create_task(client)

    response = client.post(
        f"/tasks/{task['id']}/items/import",
        headers=auth_headers(UserRole.OWNER),
        json={
            "items": [
                {"external_id": "dup", "payload": {"text": "one"}, "source_row": 3},
                {"external_id": "dup", "payload": {"text": "two"}, "source_row": 9},
            ]
        },
    )

    assert response.status_code == 400
    message = response.json()["detail"]["message"]
    assert "row 3" in message
    assert "row 9" in message
    assert "duplicate" in message


def test_import_preview_is_owner_only(client: TestClient) -> None:
    task = create_task(client)

    response = client.post(
        f"/tasks/{task['id']}/items/import/preview",
        headers=auth_headers(UserRole.LABELER),
        json={"format": "json_array", "content": "[]"},
    )

    assert response.status_code == 403


def test_import_commit_is_owner_only(client: TestClient) -> None:
    task = create_task(client)

    response = client.post(
        f"/tasks/{task['id']}/items/import",
        headers=auth_headers(UserRole.LABELER),
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )

    assert response.status_code == 403


def create_task(client: TestClient) -> dict:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.OWNER),
        json={"name": "Import task"},
    )
    assert response.status_code == 201
    return response.json()


def build_xlsx(rows: list[list[object]]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )
        archive.writestr("xl/worksheets/sheet1.xml", worksheet_xml(rows))
    return buffer.getvalue()


def worksheet_xml(rows: list[list[object]]) -> str:
    row_xml = []
    for row_index, values in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(values, start=1):
            reference = f"{column_name(column_index)}{row_index}"
            if isinstance(value, int | float):
                cells.append(f'<c r="{reference}"><v>{value}</v></c>')
            else:
                escaped = (
                    str(value)
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace('"', "&quot;")
                )
                cells.append(f'<c r="{reference}" t="inlineStr"><is><t>{escaped}</t></is></c>')
        row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>{"".join(row_xml)}</sheetData>
</worksheet>"""


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name
