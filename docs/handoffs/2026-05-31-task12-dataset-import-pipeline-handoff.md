## Agent Handoff

Agent: Dataset Import Pipeline Agent
Task file: docs/tasks/12-dataset-import-pipeline-agent.md
Status: ready for review

Changed files:
- backend/app/api/deps.py
- backend/app/api/routes/tasks.py
- backend/app/core/config.py
- backend/app/schemas/task.py
- backend/app/services/dataset_import.py
- backend/app/services/tasks.py
- backend/app/services/workflow.py
- backend/tests/test_dataset_import.py
- docs/api.md
- docs/demo-script.md
- docs/known-limitations.md
- frontend/src/api/openapi.json
- frontend/src/features/owner/DatasetImportPanel.tsx
- frontend/src/features/owner/DatasetImportPanel.test.tsx
- frontend/src/features/owner/api.ts
- frontend/src/features/owner/types.ts
- frontend/src/styles.css

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_tasks.py tests/test_dataset_import.py -q`: pass, 22 tests, 1 existing passlib `crypt` deprecation warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 82 tests, existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python -m json.tool frontend/src/api/openapi.json`: not run, `python` is not on PATH in this shell (`zsh:1: command not found: python`).
- `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task12-openapi.json`: pass.
- `cd frontend && npm test -- --run src/features/owner`: pass, 3 files and 12 tests.
- `cd frontend && npm test -- --run`: pass, 10 files and 42 tests, existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, existing Vite chunk-size warning.
- `git diff --check`: pass.
- Browser smoke: pass against local backend/frontend; owner login, task detail load, dataset tab render, JSON array preview, row table display, commit, and item count update from 0 to 1. Console errors/warnings were empty after preview/commit.

Contract changes:
- Added `POST /tasks/{task_id}/items/import/preview` for server-side preview validation.
- Preview request supports `format`, text/base64 `content`, optional `filename`, `is_base64`, and `excel_mapping`.
- Preview response returns rows, row-level errors/warnings, valid/invalid counts, and limits.
- Commit request still uses `POST /tasks/{task_id}/items/import`; item rows now allow optional `source_row` for row-context errors.
- Import validation errors may include structured `detail.errors` in addition to stable `detail.code` and `detail.message`.
- Added `LABELHUB_IMPORT_MAX_ROWS` and `LABELHUB_IMPORT_MAX_FILE_BYTES` settings.

Supported formats and limits:
- JSON array paste/upload: `.json`, `format=json_array`.
- JSONL upload/paste: `.jsonl`, `format=jsonl`, one JSON object per non-empty line.
- Excel upload: `.xlsx`, `format=xlsx`, first worksheet only.
- Defaults: 5,000 data rows and 5 MiB file content. Both are backend settings and backend validation is authoritative.

Excel mapping rules:
- First non-empty row is the header row.
- `external_id_column` defaults to `external_id`; blank values import as `null`.
- `payload_column` defaults to `payload`; if present and non-empty for a row, it must contain a JSON object string and wins over tabular payload columns.
- Without a non-empty payload JSON cell, payload is built from `payload_columns` when supplied, otherwise from all columns except external ID and payload columns.
- Numeric and boolean cells are preserved as JSON numbers/booleans. Date-style cells are not interpreted beyond the stored spreadsheet value.

Duplicate external_id policy:
- Non-empty `external_id` values must be unique within the submitted batch and must not already exist for the task.
- Duplicate IDs reject preview rows and reject commit with row context.
- LabelHub does not overwrite existing task items and does not auto-suffix IDs.
- Multiple `null` external IDs are allowed.

Partial failure policy:
- Preview can return mixed valid and invalid rows.
- The owner UI submits only rows that currently have no backend preview errors and are not removed.
- Commit is all-or-nothing. If any submitted row fails backend validation or conflicts with an existing external ID, no rows from that commit are created.

Blockers:
- None.

Requests for Supervisor:
- Review the new preview endpoint contract and the all-or-nothing duplicate policy.
- Data retention/privacy policy remains open before production datasets.
