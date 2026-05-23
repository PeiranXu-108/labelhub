from pathlib import Path

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import ExportJob
from app.services.exports import ExportService
from app.workers.celery_app import celery_app


def enqueue_export_job(job_id: str) -> None:
    run_export_job_task.delay(job_id)


@celery_app.task(name="exports.run_export_job")
def run_export_job_task(job_id: str) -> str:
    return run_export_job(job_id).id


def run_export_job(
    job_id: str,
    *,
    db: Session | None = None,
    storage_root: str | Path | None = None,
    fail_fast: bool = False,
) -> ExportJob:
    if db is not None:
        return _run_with_session(job_id, db, storage_root)

    with SessionLocal() as session:
        return _run_with_session(job_id, session, storage_root)


def _run_with_session(job_id: str, db: Session, storage_root: str | Path | None) -> ExportJob:
    try:
        return ExportService(db, storage_root=storage_root).run_export(job_id)
    except Exception:
        job = db.get(ExportJob, job_id)
        if job is None:
            raise
        db.refresh(job)
        return job
