import csv
import json
import zipfile
from datetime import UTC, datetime
from html import escape
from io import StringIO
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.domain.enums import ExportFormat, SubmissionStatus
from app.models import ExportJob, Submission, Task, TaskItem
from app.storage import LocalExportStorage


EXPORTABLE_SUBMISSION_STATUSES = (
    SubmissionStatus.APPROVED,
    SubmissionStatus.EXPORTABLE,
)


class ExportError(Exception):
    pass


class ExportService:
    def __init__(self, db: Session, storage_root: str | Path | None = None) -> None:
        self.db = db
        self.storage = LocalExportStorage(storage_root or get_settings().export_storage_path)

    def create_job(
        self,
        *,
        task_id: str,
        actor_id: str,
        export_format: ExportFormat,
        field_mapping: dict[str, str] | None = None,
        include_review_metadata: bool = True,
    ) -> ExportJob:
        task = self.db.get(Task, task_id)
        if task is None:
            raise ExportError("Task was not found")
        if task.created_by != actor_id:
            raise ExportError("Only the task owner can create exports")

        job = ExportJob(
            task_id=task_id,
            created_by=actor_id,
            format=export_format,
            field_mapping=field_mapping or {},
            include_review_metadata=include_review_metadata,
            status="pending",
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def list_jobs_for_task(self, task_id: str, actor_id: str, is_reviewer: bool = False) -> list[ExportJob]:
        task = self.db.get(Task, task_id)
        if task is None:
            raise ExportError("Task was not found")
        if task.created_by != actor_id and not is_reviewer:
            raise ExportError("This role is not allowed to view exports for this task")
        return list(
            self.db.scalars(
                select(ExportJob).where(ExportJob.task_id == task_id).order_by(ExportJob.created_at.desc())
            )
        )

    def can_download(self, job: ExportJob, actor_id: str, is_reviewer: bool = False) -> bool:
        task = self.db.get(Task, job.task_id)
        return bool(task and (task.created_by == actor_id or is_reviewer))

    def run_export(self, job_id: str) -> ExportJob:
        job = self.db.get(ExportJob, job_id)
        if job is None:
            raise ExportError("Export job was not found")

        job.status = "running"
        job.error_message = None
        self.db.commit()

        try:
            records = self._load_records(job)
            if not records:
                raise ExportError("No exportable submissions found for this task")
            output_path = self._write_records(job, records)
            job.status = "succeeded"
            job.file_path = str(output_path)
            job.error_message = None
            self.db.commit()
            self.db.refresh(job)
            return job
        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)
            self.db.commit()
            self.db.refresh(job)
            raise

    def _load_records(self, job: ExportJob) -> list[dict[str, Any]]:
        submissions = list(
            self.db.scalars(
                select(Submission)
                .options(
                    joinedload(Submission.item),
                    joinedload(Submission.ai_reviews),
                    joinedload(Submission.human_reviews),
                )
                .where(
                    Submission.task_id == job.task_id,
                    Submission.status.in_(EXPORTABLE_SUBMISSION_STATUSES),
                )
                .join(TaskItem, Submission.item_id == TaskItem.id)
                .order_by(TaskItem.external_id, Submission.id)
            )
            .unique()
        )
        return [self._record_for_submission(submission, job.include_review_metadata) for submission in submissions]

    def _record_for_submission(self, submission: Submission, include_review_metadata: bool) -> dict[str, Any]:
        record: dict[str, Any] = {
            "submission_id": submission.id,
            "task_id": submission.task_id,
            "item_id": submission.item_id,
            "labeler_id": submission.labeler_id,
            "schema_version": submission.schema_version,
            "status": SubmissionStatus(submission.status).value,
            "submitted_at": _iso_or_none(submission.submitted_at),
            "updated_at": _iso_or_none(submission.updated_at),
            "item": {
                "id": submission.item.id,
                "external_id": submission.item.external_id,
                "payload": submission.item.payload,
            },
            "answers": submission.answer_payload,
        }
        if include_review_metadata:
            record["reviews"] = {
                "ai": [
                    {
                        "id": review.id,
                        "decision": review.decision.value,
                        "overall_score": review.overall_score,
                        "status": review.status,
                        "structured_response": review.structured_response,
                        "model_name": review.model_name,
                        "created_at": _iso_or_none(review.created_at),
                    }
                    for review in submission.ai_reviews
                ],
                "human": [
                    {
                        "id": review.id,
                        "reviewer_id": review.reviewer_id,
                        "decision": review.decision,
                        "reason": review.reason,
                        "metadata": review.review_metadata,
                        "created_at": _iso_or_none(review.created_at),
                    }
                    for review in submission.human_reviews
                ],
            }
        return record

    def _write_records(self, job: ExportJob, records: list[dict[str, Any]]) -> Path:
        extension = "xlsx" if job.format == ExportFormat.XLSX else job.format.value
        output_path = self.storage.export_path(task_id=job.task_id, job_id=job.id, extension=extension)
        match ExportFormat(job.format):
            case ExportFormat.JSON:
                _write_json(output_path, job, records)
            case ExportFormat.JSONL:
                _write_jsonl(output_path, job, records)
            case ExportFormat.CSV:
                _write_csv(output_path, job.field_mapping, records)
            case ExportFormat.XLSX:
                _write_xlsx(output_path, job.field_mapping, records, job.include_review_metadata)
        return output_path


def _write_json(path: Path, job: ExportJob, records: list[dict[str, Any]]) -> None:
    payload = {
        "job_id": job.id,
        "task_id": job.task_id,
        "format": ExportFormat(job.format).value,
        "generated_at": datetime.now(UTC).isoformat(),
        "record_count": len(records),
        "records": _mapped_records(job.field_mapping, records) if job.field_mapping else records,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_jsonl(path: Path, job: ExportJob, records: list[dict[str, Any]]) -> None:
    output_records = _mapped_records(job.field_mapping, records) if job.field_mapping else records
    with path.open("w", encoding="utf-8") as file:
        for record in output_records:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def _write_csv(path: Path, field_mapping: dict[str, str], records: list[dict[str, Any]]) -> None:
    output_records = _mapped_records(field_mapping, records) if field_mapping else _default_csv_records(records)
    fieldnames = list(output_records[0].keys())
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for record in output_records:
        writer.writerow({key: _csv_cell(value) for key, value in record.items()})
    path.write_text(buffer.getvalue(), encoding="utf-8")


def _write_xlsx(
    path: Path,
    field_mapping: dict[str, str],
    records: list[dict[str, Any]],
    include_review_metadata: bool,
) -> None:
    submission_rows = _mapped_records(field_mapping, records) if field_mapping else _default_csv_records(records)
    sheets = {"Submissions": submission_rows}
    if include_review_metadata:
        review_rows = _review_rows(records)
        if review_rows:
            sheets["Review Metadata"] = review_rows
    _MinimalXlsxWriter.write(path, sheets)


def _mapped_records(field_mapping: dict[str, str], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{target: _get_path(record, source) for source, target in field_mapping.items()} for record in records]


def _default_csv_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "submission_id": record["submission_id"],
            "item_external_id": record["item"]["external_id"],
            "status": record["status"],
            "schema_version": record["schema_version"],
            "answers": record["answers"],
            "item_payload": record["item"]["payload"],
        }
        for record in records
    ]


def _review_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in records:
        reviews = record.get("reviews") or {}
        for review in reviews.get("ai", []):
            rows.append(
                {
                    "submission_id": record["submission_id"],
                    "review_type": "ai",
                    "decision": review["decision"],
                    "score": review["overall_score"],
                    "reviewer_id": "",
                    "reason": "",
                }
            )
        for review in reviews.get("human", []):
            rows.append(
                {
                    "submission_id": record["submission_id"],
                    "review_type": "human",
                    "decision": review["decision"],
                    "score": "",
                    "reviewer_id": review["reviewer_id"],
                    "reason": review["reason"] or "",
                }
            )
    return rows


def _get_path(record: dict[str, Any], path: str) -> Any:
    current: Any = record
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            current = current[int(part)]
        else:
            return None
    return current


def _csv_cell(value: Any) -> str | int | float | None:
    if value is None or isinstance(value, (str, int, float)):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _iso_or_none(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


class _MinimalXlsxWriter:
    @classmethod
    def write(cls, path: Path, sheets: dict[str, list[dict[str, Any]]]) -> None:
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as workbook:
            workbook.writestr("[Content_Types].xml", cls._content_types(len(sheets)))
            workbook.writestr("_rels/.rels", cls._root_relationships())
            workbook.writestr("xl/workbook.xml", cls._workbook_xml(list(sheets)))
            workbook.writestr("xl/_rels/workbook.xml.rels", cls._workbook_relationships(len(sheets)))
            for index, rows in enumerate(sheets.values(), start=1):
                workbook.writestr(f"xl/worksheets/sheet{index}.xml", cls._sheet_xml(rows))

    @staticmethod
    def _content_types(sheet_count: int) -> str:
        sheets = "".join(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for index in range(1, sheet_count + 1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f"{sheets}</Types>"
        )

    @staticmethod
    def _root_relationships() -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/></Relationships>'
        )

    @staticmethod
    def _workbook_xml(sheet_names: list[str]) -> str:
        sheets = "".join(
            f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
            for index, name in enumerate(sheet_names, start=1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{sheets}</sheets></workbook>"
        )

    @staticmethod
    def _workbook_relationships(sheet_count: int) -> str:
        relationships = "".join(
            f'<Relationship Id="rId{index}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{index}.xml"/>'
            for index in range(1, sheet_count + 1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{relationships}</Relationships>"
        )

    @classmethod
    def _sheet_xml(cls, rows: list[dict[str, Any]]) -> str:
        headers = list(rows[0].keys()) if rows else []
        table_rows = [headers] + [[_csv_cell(row.get(header)) for header in headers] for row in rows]
        row_xml = "".join(
            f'<row r="{row_index}">'
            + "".join(
                cls._cell_xml(row_index, column_index, value)
                for column_index, value in enumerate(values, start=1)
            )
            + "</row>"
            for row_index, values in enumerate(table_rows, start=1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f"<sheetData>{row_xml}</sheetData></worksheet>"
        )

    @staticmethod
    def _cell_xml(row_index: int, column_index: int, value: Any) -> str:
        cell_ref = f"{_column_name(column_index)}{row_index}"
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<c r="{cell_ref}"><v>{value}</v></c>'
        return f'<c r="{cell_ref}" t="inlineStr"><is><t>{escape("" if value is None else str(value))}</t></is></c>'


def _column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name
