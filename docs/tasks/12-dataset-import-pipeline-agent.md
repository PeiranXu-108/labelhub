# Task 12: Dataset Import Pipeline Agent

## Mission

Replace the owner-only pasted JSON-array importer with a real dataset import pipeline that supports JSON array, JSONL, Excel file upload, preview, validation, and batch editing before commit.

This task owns import ergonomics and import validation. It must not change assignment workflow semantics.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/12-dataset-import-pipeline-agent.md`
- Current importer in `frontend/src/features/owner/DatasetImportPanel.tsx`
- Current task item import API in `backend/app/api/routes/tasks.py` and `backend/app/services/tasks.py`
- Current task item schemas in `backend/app/schemas/task.py`

## Dependencies

- Task 02 backend domain/API is approved.
- Task 06 owner frontend is approved.
- Task 10 auth login is approved.
- Task 11 is optional; if Task 11 is active, coordinate owner task detail UI edits.

## Owned Areas

- Backend item import schemas and services under `backend/app/schemas/`, `backend/app/services/`, and `backend/app/api/routes/tasks.py`.
- Backend import parsing helpers under `backend/app/services/` or `backend/app/importers/` if a new package is cleaner.
- Alembic migrations only if import batch persistence is introduced.
- Backend tests for import parsing and item creation.
- `frontend/src/features/owner/DatasetImportPanel.tsx`
- New owner import subcomponents under `frontend/src/features/owner/` if needed.
- Owner frontend tests for import preview/edit/submit.
- Generated `frontend/src/api/openapi.json` only via backend OpenAPI export.
- `docs/api.md`, `docs/demo-script.md`, and `docs/known-limitations.md` for import format documentation.
- `docs/handoffs/<date>-task12-dataset-import-pipeline-handoff.md`

## Non-Owned Areas

- Assignment claiming and workflow transitions.
- Template schema validation.
- Export writers.
- Auth behavior.

## Required Backend Contract

Support import from:

- pasted JSON array
- uploaded `.json`
- uploaded `.jsonl`
- uploaded `.xlsx`

Each imported item must resolve to:

- `external_id: string | null`
- `payload: object`

Backend must validate:

- non-empty import
- maximum row/file limits from configuration
- each row/object has object payload
- duplicate `external_id` handling is deterministic and documented
- Excel column mapping is explicit, with either a `payload` JSON column or selected columns converted into payload keys
- parse errors include row number and field context where possible

## Required Frontend Behavior

- Import panel supports paste and file upload modes.
- Preview table shows parsed rows, errors, warnings, external ID, and payload keys.
- Owner can batch edit before commit:
  - edit `external_id`
  - edit payload cells for tabular imports
  - remove invalid/unwanted rows
  - apply a payload key rename across rows
- Commit sends only validated rows to the backend.
- UI clearly distinguishes parse errors from backend create errors.

## Implementation Steps

- [ ] Add backend parser helpers for JSON array, JSONL, and Excel import input.
- [ ] Add backend validation tests for row-level parse errors, duplicate external IDs, and Excel mapping.
- [ ] Expand or add import preview/commit API contracts if parsing moves server-side.
- [ ] Update item creation service to report partial-row validation clearly or reject the whole batch consistently.
- [ ] Update `DatasetImportPanel` with paste/file modes, preview table, row errors, and batch editing.
- [ ] Add frontend tests for JSONL upload, Excel preview mapping, row removal, edit-before-commit, and backend error display.
- [ ] Regenerate `frontend/src/api/openapi.json` if API contracts changed.
- [ ] Update docs with supported import formats and limits.
- [ ] Create the standard handoff.

## Required Tests

- JSON array paste still imports successfully.
- JSONL file with one object per line previews and imports.
- Invalid JSONL reports the exact line number.
- Excel import maps rows to payload objects.
- Empty files and empty arrays are rejected.
- Duplicate `external_id` behavior is tested.
- Batch edit changes the submitted payload.
- Removing invalid rows allows valid rows to import.
- Owner-only permissions still apply to import endpoints.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_tasks.py tests/test_dataset_import.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/owner
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

If `tests/test_dataset_import.py` does not exist yet, create it for the importer-specific backend coverage.

## Handoff Requirements

Create `docs/handoffs/<date>-task12-dataset-import-pipeline-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Supported file formats and size/row limits.
- Whether parsing happens client-side, server-side, or both.
- Excel mapping rules.
- Duplicate `external_id` policy.
- Partial failure policy.
- OpenAPI regeneration result.
- Backend/frontend tests and build results.
- Remaining data-retention or privacy decisions.

