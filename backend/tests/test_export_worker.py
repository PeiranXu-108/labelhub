from pathlib import Path

from sqlalchemy.orm import Session

from app.domain.enums import ExportFormat, TaskStatus, UserRole
from app.models import ExportJob, Task, User
from app.workers.exports import run_export_job


def test_failed_export_records_error_message_and_status(db_session: Session, tmp_path: Path) -> None:
    owner = User(id="owner-worker", email="owner-worker@example.com", name="Owner", role=UserRole.OWNER)
    task = Task(name="Broken export", status=TaskStatus.PUBLISHED, created_by=owner.id)
    db_session.add_all([owner, task])
    db_session.flush()
    job = ExportJob(
        task_id=task.id,
        created_by=owner.id,
        format=ExportFormat.CSV,
        field_mapping={"missing.path": "missing"},
    )
    db_session.add(job)
    db_session.commit()

    run_export_job(job.id, db=db_session, storage_root=tmp_path, fail_fast=True)

    db_session.refresh(job)
    assert job.status == "failed"
    assert "No exportable submissions" in job.error_message
