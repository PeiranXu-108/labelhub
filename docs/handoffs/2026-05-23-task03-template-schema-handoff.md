# Task 03 Template Schema Handoff - 2026-05-23

## Agent Handoff

Agent: Template Schema Agent
Task file: docs/tasks/03-template-schema-agent.md
Status: ready for review

Changed files:
- backend/app/api/routes/templates.py
- backend/app/main.py
- backend/app/schemas/template.py
- backend/app/services/submissions.py
- backend/app/services/templates.py
- backend/tests/test_review_api.py
- backend/tests/test_template_schema.py
- frontend/src/api/openapi.json
- frontend/src/features/schema-renderer/SchemaRenderer.test.tsx
- frontend/src/features/schema-renderer/SchemaRenderer.tsx
- frontend/src/features/schema-renderer/index.ts
- frontend/src/features/schema-renderer/types.ts
- frontend/src/features/template/TemplateDesigner.test.tsx
- frontend/src/features/template/TemplateDesigner.tsx
- frontend/src/features/template/index.ts
- frontend/src/styles.css
- docs/handoffs/2026-05-23-task03-template-schema-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_template_schema.py -q: pass, 5 tests passed; warning from Pydantic about alias metadata while generating schema.
- cd backend && ./.venv313/bin/pytest -q: pass, 20 tests passed; same Pydantic alias warning.
- cd frontend && npm test -- --run: pass, 8 tests passed.
- cd frontend && npm run build: pass.
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass, refreshed frontend/src/api/openapi.json.
- python -m json.tool frontend/src/api/openapi.json: pass.

Final template JSON shape:
- Root object: `version`, `title`, `layout`, `fields`, `llmTools`, `validations`, `visibilityRules`.
- `layout`: `{ "type": "single", "groups": [] }` for MVP.
- `fields`: discriminated union on `type`.
- Supported MVP `type` values only: `show_item`, `text`, `textarea`, `number`, `radio`, `checkbox_group`, `select`, `rating`, `json`, `llm_trigger`.
- Common field keys: `id`, `type`, `label`, optional `required`, optional `helpText`.
- `show_item` requires `source` with `item.payload...` path format.
- Option fields require non-empty `options` with unique `value`.
- `llm_trigger` requires `promptTemplate` and `targetFieldId` referencing an existing field.
- `llmTools` entries require `id`, `label`, `promptTemplate`, `targetFieldId` referencing an existing field.

Versioning behavior:
- Save draft: `POST /tasks/{task_id}/template/draft` with body `{ "schema": <TemplateDocument> }`.
- Publish draft: `POST /tasks/{task_id}/template/publish`.
- Read latest: `GET /tasks/{task_id}/template`.
- First draft for a task uses version 1.
- Saving a draft while no newer draft exists updates the unpublished draft only.
- Once a draft is published, it is locked with `is_published=true` and `published_at`.
- Saving after a published version creates the next unpublished draft version.
- Publishing the changed draft creates a new immutable published row; older published rows are not mutated.

Renderer props contract:
- `SchemaRenderer` is exported from `frontend/src/features/schema-renderer`.
- Props: `schema`, `item`, optional `initialAnswers`, optional `readOnly`, optional `onChange`, optional `onSubmit`.
- `schema` type: `TemplateSchemaDocument`.
- `item` type: `{ id?: string; external_id?: string | null; payload: Record<string, unknown> }`.
- `onChange` receives the current answer payload.
- `onSubmit` receives the answer payload only after frontend required-field validation passes.
- Frontend validation is advisory; backend still revalidates drafts and submissions.

Backend model assumptions:
- Reused Task 02 `TemplateSchema` fields: `task_id`, `version`, `title`, `schema_payload`, `is_published`, `created_by`, `created_at`, `published_at`.
- Reused Task 02 unique constraint: `(task_id, version)`.
- No database migration or persistence-field change was required.
- Submissions continue storing `template_schema_id` and `schema_version`.

Cross-module changes:
- Task 03 extended `backend/app/services/submissions.py`, a Task 02-owned module, to validate `answer_payload` against the stored template snapshot before draft save or submit.
- Submission draft save validates unknown field ids and type/option correctness but does not require required fields.
- Submission submit validates unknown field ids, type/option correctness, and required fields.
- Invalid answers raise `INVALID_SUBMISSION_PAYLOAD`.

Package manager/dependency notes:
- No backend dependency changes.
- No frontend dependency changes.
- Existing package managers remain pip/pyproject for backend and npm/package-lock for frontend.

Downstream contracts:
- Frontend agents should post template drafts with `{ "schema": <TemplateDocument> }`; OpenAPI now exposes `TemplateDraftRequest.schema`, not `template_schema`.
- Labeler/Reviewer Frontend agents should handle `INVALID_SUBMISSION_PAYLOAD` from draft save and submit.
- AI Review Agent can rely on `Submission.template_schema` and `Submission.schema_version` pointing to an immutable published schema snapshot.
- Worker Export Agent can export `answer_payload` knowing it passed schema validation at submission time.

Contract changes:
- Added template endpoints to FastAPI and OpenAPI.
- Added `TemplateDocument`, field union schemas, and `TemplateSchemaRead` to OpenAPI.
- Added frontend renderer/designer TypeScript contracts under `frontend/src/features`.

Blockers:
- none

Requests for Supervisor:
- Re-review Task 03 after the OpenAPI request-body correction and formal handoff addition.
