import csv
import json
import zipfile
from io import StringIO
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import ExportFormat, SubmissionStatus, TaskStatus, UserRole
from app.models import AIReview, ExportJob, HumanReview, Submission, Task, TaskItem, TemplateSchema, User
from app.services.exports import ExportService
from tests.conftest import auth_headers


def _seed_exportable_submissions(db: Session) -> tuple[Task, User, User, list[Submission]]:
    owner = User(id="owner-export", email="owner-export@example.com", name="Owner", role=UserRole.OWNER)
    labeler = User(id="labeler-export", email="labeler-export@example.com", name="Labeler", role=UserRole.LABELER)
    reviewer = User(
        id="reviewer-export", email="reviewer-export@example.com", name="Reviewer", role=UserRole.REVIEWER
    )
    db.add_all([owner, labeler, reviewer])
    db.flush()

    task = Task(name="Exportable task", status=TaskStatus.PUBLISHED, created_by=owner.id)
    schema = TemplateSchema(
        task=task,
        version=1,
        title="Export schema",
        schema_payload={"version": 1, "fields": []},
        is_published=True,
        created_by=owner.id,
    )
    db.add_all([task, schema])
    db.flush()

    submissions: list[Submission] = []
    statuses = [
        SubmissionStatus.APPROVED,
        SubmissionStatus.EXPORTABLE,
        SubmissionStatus.RETURNED,
    ]
    for index, status in enumerate(statuses, start=1):
        item = TaskItem(
            task=task,
            external_id=f"row-{index}",
            payload={"text": f"sample {index}", "metadata": {"source": "unit", "index": index}},
        )
        submission = Submission(
            task=task,
            item=item,
            labeler=labeler,
            template_schema=schema,
            schema_version=1,
            answer_payload={"sentiment": "positive", "nested": {"confidence": index}},
            status=status,
        )
        submissions.append(submission)
        db.add_all([item, submission])
    db.flush()

    db.add(
        AIReview(
            submission_id=submissions[0].id,
            decision="pass",
            overall_score=92,
            structured_response={"decision": "pass", "overall_score": 92},
            model_name="unit-model",
        )
    )
    db.add(
        HumanReview(
            submission_id=submissions[0].id,
            reviewer_id=reviewer.id,
            decision="approve",
            reason=None,
        )
    )
    db.commit()
    return task, owner, labeler, submissions


def test_json_export_contains_approved_and_exportable_submissions_only(
    db_session: Session, tmp_path: Path
) -> None:
    task, owner, _labeler, submissions = _seed_exportable_submissions(db_session)
    service = ExportService(db_session, storage_root=tmp_path)
    job = ExportJob(task_id=task.id, created_by=owner.id, format=ExportFormat.JSON, field_mapping={})
    db_session.add(job)
    db_session.commit()

    completed = service.run_export(job.id)

    payload = json.loads(Path(completed.file_path).read_text(encoding="utf-8"))
    exported_ids = {record["submission_id"] for record in payload["records"]}
    assert completed.status == "succeeded"
    assert exported_ids == {submissions[0].id, submissions[1].id}
    assert submissions[2].id not in exported_ids
    assert payload["records"][0]["reviews"]["ai"][0]["overall_score"] == 92


def test_jsonl_output_has_one_record_per_line(db_session: Session, tmp_path: Path) -> None:
    task, owner, _labeler, _submissions = _seed_exportable_submissions(db_session)
    service = ExportService(db_session, storage_root=tmp_path)
    job = ExportJob(task_id=task.id, created_by=owner.id, format=ExportFormat.JSONL, field_mapping={})
    db_session.add(job)
    db_session.commit()

    completed = service.run_export(job.id)

    lines = Path(completed.file_path).read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert all(json.loads(line)["status"] in {"approved", "exportable"} for line in lines)


def test_csv_output_contains_configured_renamed_columns_and_stringified_nested_json(
    db_session: Session, tmp_path: Path
) -> None:
    task, owner, _labeler, _submissions = _seed_exportable_submissions(db_session)
    service = ExportService(db_session, storage_root=tmp_path)
    job = ExportJob(
        task_id=task.id,
        created_by=owner.id,
        format=ExportFormat.CSV,
        field_mapping={
            "item.payload.text": "source_text",
            "answers.sentiment": "label",
            "answers.nested": "nested_answer",
        },
    )
    db_session.add(job)
    db_session.commit()

    completed = service.run_export(job.id)

    rows = list(csv.DictReader(StringIO(Path(completed.file_path).read_text(encoding="utf-8"))))
    assert rows[0]["source_text"] == "sample 1"
    assert rows[0]["label"] == "positive"
    assert json.loads(rows[0]["nested_answer"]) == {"confidence": 1}


def test_excel_export_creates_workbook_with_expected_sheet(db_session: Session, tmp_path: Path) -> None:
    task, owner, _labeler, _submissions = _seed_exportable_submissions(db_session)
    service = ExportService(db_session, storage_root=tmp_path)
    job = ExportJob(
        task_id=task.id,
        created_by=owner.id,
        format=ExportFormat.XLSX,
        field_mapping={"item.external_id": "external_id", "answers.sentiment": "label"},
    )
    db_session.add(job)
    db_session.commit()

    completed = service.run_export(job.id)

    with zipfile.ZipFile(completed.file_path) as workbook:
        workbook_xml = workbook.read("xl/workbook.xml").decode("utf-8")
        assert 'name="Submissions"' in workbook_xml


def test_owner_can_create_and_list_export_job_asynchronous_contract(
    client: TestClient, monkeypatch
) -> None:
    owner_headers = auth_headers(UserRole.OWNER, user_id="owner-export-api")
    task = client.post("/tasks", headers=owner_headers, json={"name": "API export"}).json()
    enqueued: list[str] = []

    monkeypatch.setattr("app.api.routes.exports.enqueue_export_job", enqueued.append)

    create_response = client.post(
        f"/tasks/{task['id']}/exports",
        headers=owner_headers,
        json={
            "format": "csv",
            "field_mapping": {"item.payload.text": "text", "answers.sentiment": "label"},
            "include_review_metadata": False,
        },
    )

    assert create_response.status_code == 202
    created = create_response.json()
    assert created["status"] == "pending"
    assert created["field_mapping"] == {"item.payload.text": "text", "answers.sentiment": "label"}
    assert created["include_review_metadata"] is False
    assert enqueued == [created["id"]]

    list_response = client.get(f"/tasks/{task['id']}/exports", headers=owner_headers)
    assert list_response.status_code == 200
    assert [job["id"] for job in list_response.json()] == [created["id"]]


def test_download_denied_for_unauthorized_user(
    client: TestClient, db_session: Session, tmp_path: Path
) -> None:
    task, owner, labeler, _submissions = _seed_exportable_submissions(db_session)
    export_path = tmp_path / "exports" / "task-export.json"
    export_path.parent.mkdir()
    export_path.write_text('{"records":[]}', encoding="utf-8")
    job = ExportJob(
        task_id=task.id,
        created_by=owner.id,
        format=ExportFormat.JSON,
        field_mapping={},
        status="succeeded",
        file_path=str(export_path),
    )
    db_session.add(job)
    db_session.commit()

    response = client.get(
        f"/exports/{job.id}/download",
        headers=auth_headers(UserRole.LABELER, user_id=labeler.id),
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PERMISSION_DENIED"
