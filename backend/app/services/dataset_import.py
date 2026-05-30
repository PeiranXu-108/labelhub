from __future__ import annotations

import base64
import binascii
import json
import re
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any, Literal
from zipfile import BadZipFile, ZipFile
import xml.etree.ElementTree as ET


ImportFormat = Literal["json_array", "jsonl", "xlsx"]

SPREADSHEET_NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CELL_REF_RE = re.compile(r"^([A-Z]+)")


@dataclass(frozen=True)
class ExcelMapping:
    external_id_column: str = "external_id"
    payload_column: str | None = "payload"
    payload_columns: list[str] | None = None


@dataclass(frozen=True)
class ImportIssue:
    code: str
    message: str
    row_number: int | None = None
    field: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "row_number": self.row_number,
            "field": self.field,
            "code": self.code,
            "message": self.message,
        }


@dataclass
class ImportPreviewRow:
    row_number: int
    external_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    errors: list[ImportIssue] = field(default_factory=list)
    warnings: list[ImportIssue] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "row_number": self.row_number,
            "external_id": self.external_id,
            "payload": self.payload,
            "errors": [error.to_dict() for error in self.errors],
            "warnings": [warning.to_dict() for warning in self.warnings],
        }


@dataclass
class ImportPreview:
    rows: list[ImportPreviewRow]
    errors: list[ImportIssue]
    max_rows: int
    max_file_bytes: int

    def to_dict(self) -> dict[str, Any]:
        invalid_rows = [row for row in self.rows if not row.is_valid]
        return {
            "rows": [row.to_dict() for row in self.rows],
            "errors": [error.to_dict() for error in self.errors],
            "valid_count": len([row for row in self.rows if row.is_valid]),
            "invalid_count": len(invalid_rows),
            "limits": {
                "max_rows": self.max_rows,
                "max_file_bytes": self.max_file_bytes,
            },
        }


class ImportValidationError(Exception):
    def __init__(self, issues: list[ImportIssue]) -> None:
        self.issues = issues
        super().__init__(format_import_issues(issues))


def preview_import_source(
    *,
    import_format: ImportFormat,
    content: str,
    is_base64: bool,
    excel_mapping: ExcelMapping,
    max_rows: int,
    max_file_bytes: int,
    existing_external_ids: set[str] | None = None,
) -> ImportPreview:
    decoded = decode_content(content, is_base64=is_base64)
    if isinstance(decoded, ImportIssue):
        return ImportPreview(rows=[], errors=[decoded], max_rows=max_rows, max_file_bytes=max_file_bytes)

    raw_bytes = decoded
    if len(raw_bytes) > max_file_bytes:
        issue = ImportIssue(
            code="FILE_TOO_LARGE",
            field="file",
            message=f"Import file exceeds the {max_file_bytes} byte limit.",
        )
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=max_file_bytes)

    if import_format == "xlsx":
        preview = parse_xlsx(raw_bytes, excel_mapping=excel_mapping, max_rows=max_rows)
    else:
        text = raw_bytes.decode("utf-8-sig", errors="replace")
        preview = parse_json_array(text, max_rows=max_rows) if import_format == "json_array" else parse_jsonl(text, max_rows=max_rows)

    preview.max_file_bytes = max_file_bytes
    annotate_external_id_errors(preview.rows, existing_external_ids=existing_external_ids or set())
    preview.errors.extend(row_error for row in preview.rows for row_error in row.errors)
    return preview


def validate_items_for_commit(
    items: list[dict[str, Any]],
    *,
    existing_external_ids: set[str],
    max_rows: int,
) -> list[dict[str, Any]]:
    issues: list[ImportIssue] = []
    if not items:
        issues.append(ImportIssue(code="EMPTY_IMPORT", field="items", message="Import must contain at least one row."))
        raise ImportValidationError(issues)

    if len(items) > max_rows:
        issues.append(
            ImportIssue(
                code="ROW_LIMIT_EXCEEDED",
                field="items",
                message=f"Import contains {len(items)} rows, which exceeds the {max_rows} row limit.",
            )
        )
        raise ImportValidationError(issues)

    rows: list[ImportPreviewRow] = []
    normalized_items: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        row_number = item.get("source_row") or index
        row = ImportPreviewRow(row_number=row_number)
        row.external_id = normalize_external_id(item.get("external_id"), row=row, coerce=False)
        payload = item.get("payload")
        if not isinstance(payload, dict):
            row.errors.append(
                ImportIssue(
                    code="INVALID_PAYLOAD",
                    field="payload",
                    row_number=row_number,
                    message="Payload must be a JSON object.",
                )
            )
            payload = {}
        row.payload = payload
        rows.append(row)
        normalized_items.append(
            {
                "external_id": row.external_id,
                "payload": row.payload,
            }
        )

    annotate_external_id_errors(rows, existing_external_ids=existing_external_ids)
    issues.extend(error for row in rows for error in row.errors)
    if issues:
        raise ImportValidationError(issues)
    return normalized_items


def parse_json_array(text: str, *, max_rows: int) -> ImportPreview:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        issue = ImportIssue(
            code="INVALID_JSON",
            field="file",
            message=f"Invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}.",
            row_number=exc.lineno,
        )
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    if not isinstance(parsed, list):
        issue = ImportIssue(code="INVALID_JSON_ARRAY", field="file", message="JSON import must be an array.")
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    if not parsed:
        issue = ImportIssue(code="EMPTY_IMPORT", field="file", message="Import must contain at least one row.")
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    if len(parsed) > max_rows:
        issue = ImportIssue(
            code="ROW_LIMIT_EXCEEDED",
            field="file",
            message=f"Import contains {len(parsed)} rows, which exceeds the {max_rows} row limit.",
        )
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    return ImportPreview(
        rows=[record_to_preview_row(entry, row_number=index) for index, entry in enumerate(parsed, start=1)],
        errors=[],
        max_rows=max_rows,
        max_file_bytes=0,
    )


def parse_jsonl(text: str, *, max_rows: int) -> ImportPreview:
    rows: list[ImportPreviewRow] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as exc:
            rows.append(
                ImportPreviewRow(
                    row_number=line_number,
                    errors=[
                        ImportIssue(
                            code="INVALID_JSON",
                            field="line",
                            row_number=line_number,
                            message=f"Invalid JSON at line {line_number}, column {exc.colno}: {exc.msg}.",
                        )
                    ],
                )
            )
            continue
        rows.append(record_to_preview_row(parsed, row_number=line_number))

    if not rows:
        issue = ImportIssue(code="EMPTY_IMPORT", field="file", message="Import must contain at least one row.")
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    if len(rows) > max_rows:
        issue = ImportIssue(
            code="ROW_LIMIT_EXCEEDED",
            field="file",
            message=f"Import contains {len(rows)} rows, which exceeds the {max_rows} row limit.",
        )
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    return ImportPreview(rows=rows, errors=[], max_rows=max_rows, max_file_bytes=0)


def parse_xlsx(raw_bytes: bytes, *, excel_mapping: ExcelMapping, max_rows: int) -> ImportPreview:
    try:
        with ZipFile(BytesIO(raw_bytes)) as archive:
            worksheet_path = first_worksheet_path(archive)
            shared_strings = read_shared_strings(archive)
            rows = read_worksheet_rows(archive, worksheet_path, shared_strings)
    except (BadZipFile, ET.ParseError, KeyError, ValueError) as exc:
        issue = ImportIssue(
            code="INVALID_XLSX",
            field="file",
            message=f"Excel file could not be parsed: {exc}.",
        )
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    non_empty_rows = [(row_number, values) for row_number, values in rows if any(value is not None for value in values)]
    if len(non_empty_rows) <= 1:
        issue = ImportIssue(code="EMPTY_IMPORT", field="file", message="Excel import must include a header row and at least one data row.")
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    header_row_number, header_values = non_empty_rows[0]
    headers = [normalize_header(value) for value in header_values]
    header_errors = validate_headers(headers, header_row_number=header_row_number, mapping=excel_mapping)
    if header_errors:
        return ImportPreview(rows=[], errors=header_errors, max_rows=max_rows, max_file_bytes=0)

    header_index = {header: index for index, header in enumerate(headers) if header}
    data_rows = non_empty_rows[1:]
    if len(data_rows) > max_rows:
        issue = ImportIssue(
            code="ROW_LIMIT_EXCEEDED",
            field="file",
            message=f"Import contains {len(data_rows)} rows, which exceeds the {max_rows} row limit.",
        )
        return ImportPreview(rows=[], errors=[issue], max_rows=max_rows, max_file_bytes=0)

    preview_rows = [
        excel_row_to_preview_row(
            row_number=row_number,
            values=values,
            headers=headers,
            header_index=header_index,
            mapping=excel_mapping,
        )
        for row_number, values in data_rows
    ]
    return ImportPreview(rows=preview_rows, errors=[], max_rows=max_rows, max_file_bytes=0)


def record_to_preview_row(entry: Any, *, row_number: int) -> ImportPreviewRow:
    row = ImportPreviewRow(row_number=row_number)
    if not isinstance(entry, dict):
        row.errors.append(
            ImportIssue(
                code="INVALID_ROW",
                field="row",
                row_number=row_number,
                message="Import row must be a JSON object.",
            )
        )
        return row

    row.external_id = normalize_external_id(entry.get("external_id"), row=row, coerce=False)
    if "payload" in entry:
        payload = entry.get("payload")
        if isinstance(payload, dict):
            row.payload = payload
        else:
            row.errors.append(
                ImportIssue(
                    code="INVALID_PAYLOAD",
                    field="payload",
                    row_number=row_number,
                    message="Payload must be a JSON object.",
                )
            )
        extra_keys = sorted(key for key in entry if key not in {"external_id", "payload"})
        if extra_keys:
            row.warnings.append(
                ImportIssue(
                    code="IGNORED_TOP_LEVEL_FIELDS",
                    field="payload",
                    row_number=row_number,
                    message=f"Top-level fields ignored because payload is present: {', '.join(extra_keys)}.",
                )
            )
    else:
        row.payload = {key: value for key, value in entry.items() if key != "external_id"}
    return row


def excel_row_to_preview_row(
    *,
    row_number: int,
    values: list[Any],
    headers: list[str],
    header_index: dict[str, int],
    mapping: ExcelMapping,
) -> ImportPreviewRow:
    row = ImportPreviewRow(row_number=row_number)
    external_id = cell_value(values, header_index.get(mapping.external_id_column))
    row.external_id = normalize_external_id(external_id, row=row, coerce=True)

    payload_value = cell_value(values, header_index.get(mapping.payload_column or ""))
    if mapping.payload_column and mapping.payload_column in header_index and payload_value not in (None, ""):
        if not isinstance(payload_value, str):
            row.errors.append(
                ImportIssue(
                    code="INVALID_PAYLOAD_JSON",
                    field=mapping.payload_column,
                    row_number=row_number,
                    message="Excel payload column must contain a JSON object string.",
                )
            )
            return row
        try:
            parsed_payload = json.loads(payload_value)
        except json.JSONDecodeError as exc:
            row.errors.append(
                ImportIssue(
                    code="INVALID_PAYLOAD_JSON",
                    field=mapping.payload_column,
                    row_number=row_number,
                    message=f"Invalid payload JSON at column {mapping.payload_column}: {exc.msg}.",
                )
            )
            return row
        if not isinstance(parsed_payload, dict):
            row.errors.append(
                ImportIssue(
                    code="INVALID_PAYLOAD",
                    field=mapping.payload_column,
                    row_number=row_number,
                    message="Excel payload JSON must be an object.",
                )
            )
            return row
        row.payload = parsed_payload
        return row

    selected_headers = mapping.payload_columns or [
        header
        for header in headers
        if header and header not in {mapping.external_id_column, mapping.payload_column}
    ]
    row.payload = {
        header: value
        for header in selected_headers
        if (value := cell_value(values, header_index.get(header))) is not None
    }
    return row


def annotate_external_id_errors(rows: list[ImportPreviewRow], *, existing_external_ids: set[str]) -> None:
    first_seen: dict[str, ImportPreviewRow] = {}
    first_duplicate_reported: set[str] = set()
    for row in rows:
        if not row.external_id:
            continue
        if row.external_id in existing_external_ids:
            row.errors.append(
                ImportIssue(
                    code="DUPLICATE_EXTERNAL_ID",
                    field="external_id",
                    row_number=row.row_number,
                    message=f"external_id '{row.external_id}' already exists for this task.",
                )
            )
        if row.external_id in first_seen:
            first_row = first_seen[row.external_id]
            if row.external_id not in first_duplicate_reported:
                first_row.errors.append(
                    ImportIssue(
                        code="DUPLICATE_EXTERNAL_ID",
                        field="external_id",
                        row_number=first_row.row_number,
                        message=f"external_id '{row.external_id}' is duplicate in this import batch.",
                    )
                )
                first_duplicate_reported.add(row.external_id)
            row.errors.append(
                ImportIssue(
                    code="DUPLICATE_EXTERNAL_ID",
                    field="external_id",
                    row_number=row.row_number,
                    message=f"external_id '{row.external_id}' is duplicate in this import batch.",
                )
            )
        else:
            first_seen[row.external_id] = row


def normalize_external_id(value: Any, *, row: ImportPreviewRow, coerce: bool) -> str | None:
    if value is None:
        return None
    if coerce and not isinstance(value, str):
        value = str(value)
    if not isinstance(value, str):
        row.errors.append(
            ImportIssue(
                code="INVALID_EXTERNAL_ID",
                field="external_id",
                row_number=row.row_number,
                message="external_id must be a string.",
            )
        )
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 255:
        row.errors.append(
            ImportIssue(
                code="INVALID_EXTERNAL_ID",
                field="external_id",
                row_number=row.row_number,
                message="external_id must be 255 characters or fewer.",
            )
        )
        return None
    return normalized


def decode_content(content: str, *, is_base64: bool) -> bytes | ImportIssue:
    if not content:
        return ImportIssue(code="EMPTY_IMPORT", field="file", message="Import content cannot be empty.")
    if not is_base64:
        return content.encode("utf-8")
    try:
        return base64.b64decode(content, validate=True)
    except (binascii.Error, ValueError):
        return ImportIssue(code="INVALID_BASE64", field="file", message="Uploaded file content is not valid base64.")


def first_worksheet_path(archive: ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    first_sheet = workbook.find("s:sheets/s:sheet", SPREADSHEET_NS)
    if first_sheet is None:
        raise ValueError("workbook has no sheets")
    relationship_id = first_sheet.attrib.get(f"{{{OFFICE_REL_NS}}}id")
    if not relationship_id:
        return "xl/worksheets/sheet1.xml"

    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.findall("r:Relationship", RELATIONSHIP_NS):
        if relationship.attrib.get("Id") == relationship_id:
            target = relationship.attrib["Target"].lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise ValueError("worksheet relationship was not found")


def read_shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("s:si", SPREADSHEET_NS):
        strings.append("".join(text.text or "" for text in item.findall(".//s:t", SPREADSHEET_NS)))
    return strings


def read_worksheet_rows(
    archive: ZipFile,
    worksheet_path: str,
    shared_strings: list[str],
) -> list[tuple[int, list[Any]]]:
    worksheet = ET.fromstring(archive.read(worksheet_path))
    rows: list[tuple[int, list[Any]]] = []
    for fallback_row_number, row_element in enumerate(
        worksheet.findall("s:sheetData/s:row", SPREADSHEET_NS),
        start=1,
    ):
        row_number = int(row_element.attrib.get("r", fallback_row_number))
        cells_by_index: dict[int, Any] = {}
        max_column = 0
        for cell in row_element.findall("s:c", SPREADSHEET_NS):
            column = cell_column_index(cell.attrib.get("r", ""))
            if column is None:
                column = max_column + 1
            max_column = max(max_column, column)
            cells_by_index[column] = read_cell_value(cell, shared_strings)
        rows.append((row_number, [cells_by_index.get(index) for index in range(1, max_column + 1)]))
    return rows


def read_cell_value(cell: ET.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(text.text or "" for text in cell.findall(".//s:t", SPREADSHEET_NS))

    value = cell.find("s:v", SPREADSHEET_NS)
    raw_value = value.text if value is not None else None
    if raw_value is None:
        return None
    if cell_type == "s":
        return shared_strings[int(raw_value)]
    if cell_type == "b":
        return raw_value == "1"
    if cell_type in {"str", "e"}:
        return raw_value
    return parse_number(raw_value)


def parse_number(value: str) -> Any:
    try:
        number = float(value) if "." in value else int(value)
    except ValueError:
        return value
    return number


def cell_column_index(reference: str) -> int | None:
    match = CELL_REF_RE.match(reference)
    if not match:
        return None
    index = 0
    for character in match.group(1):
        index = index * 26 + (ord(character) - ord("A") + 1)
    return index


def normalize_header(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def validate_headers(
    headers: list[str],
    *,
    header_row_number: int,
    mapping: ExcelMapping,
) -> list[ImportIssue]:
    issues: list[ImportIssue] = []
    seen: set[str] = set()
    duplicates: set[str] = set()
    for header in headers:
        if not header:
            continue
        if header in seen:
            duplicates.add(header)
        seen.add(header)
    for header in sorted(duplicates):
        issues.append(
            ImportIssue(
                code="DUPLICATE_EXCEL_HEADER",
                field=header,
                row_number=header_row_number,
                message=f"Excel header '{header}' appears more than once.",
            )
        )

    for payload_column in mapping.payload_columns or []:
        if payload_column not in seen:
            issues.append(
                ImportIssue(
                    code="UNKNOWN_PAYLOAD_COLUMN",
                    field=payload_column,
                    row_number=header_row_number,
                    message=f"Excel payload column '{payload_column}' was not found.",
                )
            )
    return issues


def cell_value(values: list[Any], index: int | None) -> Any:
    if index is None or index >= len(values):
        return None
    return values[index]


def format_import_issues(issues: list[ImportIssue]) -> str:
    if not issues:
        return "Import validation failed."
    formatted = []
    for issue in issues[:10]:
        row = f"row {issue.row_number}" if issue.row_number is not None else "file"
        field_name = f" {issue.field}" if issue.field else ""
        formatted.append(f"{row}{field_name}: {issue.message}")
    remaining = len(issues) - len(formatted)
    suffix = f"; and {remaining} more error(s)" if remaining > 0 else ""
    return f"Import contains {len(issues)} error(s): " + "; ".join(formatted) + suffix
