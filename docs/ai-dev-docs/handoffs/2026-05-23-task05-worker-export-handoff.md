# Task 05 Worker Export Agent Handoff - 2026-05-23

## Agent Handoff

Agent: Worker Export Agent
Task file: docs/tasks/05-worker-export-agent.md
Status: ready for review

Changed files:
- backend/alembic/versions/20260523_0001_core_domain.py
- backend/app/api/routes/exports.py
- backend/app/core/config.py
- backend/app/main.py
- backend/app/models/__init__.py
- backend/app/schemas/export.py
- backend/app/services/exports.py
- backend/app/storage/__init__.py
- backend/app/storage/local.py
- backend/app/workers/ai_review.py
- backend/app/workers/celery_app.py
- backend/app/workers/exports.py
- backend/pyproject.toml
- backend/tests/test_export_worker.py
- backend/tests/test_exports.py
- frontend/src/api/openapi.json
- docs/handoffs/2026-05-23-task05-worker-export-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_exports.py tests/test_export_worker.py -q: pass, 7 tests passed
- cd backend && ./.venv313/bin/pytest tests/test_ai_review_worker.py tests/test_exports.py tests/test_export_worker.py -q: pass, 8 tests passed
- cd backend && ./.venv313/bin/pytest -q: pass, 37 tests passed, 1 existing Pydantic alias warning
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass, regenerated frontend/src/api/openapi.json
- python -m json.tool frontend/src/api/openapi.json: pass
- git diff --check: pass
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task05_export.sqlite ./.venv313/bin/alembic upgrade head: pass

Storage path:
- Local MVP export root defaults to `storage/exports`.
- Runtime override: `LABELHUB_EXPORT_STORAGE_PATH`.
- Files are stored under `<storage_root>/<task_id>/`.

Generated filename scheme:
- `task-<task_id>-export-<export_job_id>.<extension>`
- Extensions are `json`, `jsonl`, `csv`, and `xlsx`.

Export format examples:
- JSON: top-level metadata plus `records`, each record containing `submission_id`, task/item identifiers, `answers`, item payload, workflow `status`, schema version, timestamps, and optional review metadata.
- JSONL: one serialized record per line.
- CSV: field mapping keys are source paths such as `item.payload.text` or `answers.sentiment`; values are output column names. Nested dict/list values are JSON-stringified.
- Excel: workbook contains a `Submissions` sheet. When review metadata is included, AI/human review rows are written to `Review Metadata`.

Worker command:
- `cd backend && celery -A app.workers.celery_app.celery_app worker --loglevel=info`
- Redis broker/result backend comes from `LABELHUB_REDIS_URL`, defaulting to `redis://localhost:6379/0`.
- Export Celery task name: `exports.run_export_job`.
- AI review Celery task wrapper name: `ai_review.run_ai_review`; direct `run_ai_review(...)` behavior remains unchanged.

Permission behavior:
- `POST /tasks/{task_id}/exports`: owner only; the owner must be the task creator.
- `GET /tasks/{task_id}/exports`: task owner or reviewer.
- `GET /exports/{export_job_id}/download`: task owner or reviewer only; labelers receive `PERMISSION_DENIED`.
- Download also requires job status `succeeded` and an existing file path.

API contract notes for Owner Frontend Agent:
- Create request body: `{ "format": "json" | "jsonl" | "csv" | "xlsx", "field_mapping": { "<source.path>": "<column_or_key>" }, "include_review_metadata": true }`.
- Create response status code: `202`; returned job starts as `pending` and is enqueued asynchronously.
- Export job statuses are lower-case strings: `pending`, `running`, `succeeded`, `failed`.
- Failed jobs expose `error_message` in `ExportJobRead`.
- Export worker only queries submissions whose existing workflow status is `approved` or `exportable`; it does not transition submissions or introduce new workflow rules.

Contract changes:
- Added export API routes to OpenAPI: `POST /tasks/{task_id}/exports`, `GET /tasks/{task_id}/exports`, and `GET /exports/{export_job_id}/download`.
- Added `ExportCreate` and `ExportJobRead` API schemas.
- Extended `ExportJob` with `include_review_metadata` and `error_message`.
- Added `LABELHUB_EXPORT_STORAGE_PATH` setting.
- Added `celery[redis]==5.4.0` backend dependency declaration.

Blockers:
- The current local virtualenv did not have Celery installed before this task; tests pass through the worker fallback path. The declared dependency must be installed before running the real Celery command.

Requests for Supervisor:
- Review the export API contract and permission model before Owner Frontend Agent builds the export UI.
