# Task 14: Rich Text and Media Fields Agent

## Mission

Add missing annotation materials and field types: rich-text input, image upload/display, and file upload/display.

This task owns schema support, backend upload contracts, storage policy for MVP, renderer behavior, and designer controls for rich media fields.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/14-rich-media-fields-agent.md`
- Current template schema in `backend/app/schemas/template.py`
- Current renderer/types in `frontend/src/features/schema-renderer/`
- Current designer in `frontend/src/features/template/TemplateDesigner.tsx`
- Current deployment and known limitation docs for storage/privacy constraints.

## Dependencies

- Task 03 template schema is approved.
- Task 06 owner frontend is approved.
- Task 13 should run first if the richer property inspector is required before adding new field controls.

## Owned Areas

- `backend/app/schemas/template.py`
- `backend/app/services/templates.py` and submission validation helpers as needed.
- Upload storage models/services/routes under `backend/app/`.
- Alembic migrations if upload metadata is persisted.
- Backend tests for rich-media fields and upload permissions.
- `frontend/src/features/schema-renderer/types.ts`
- `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- `frontend/src/features/template/` designer controls for new field types.
- Frontend tests for rich text, image, and file fields.
- Docs for upload storage, limits, and known limitations.
- `docs/handoffs/<date>-task14-rich-media-fields-handoff.md`

## Non-Owned Areas

- External object storage provider integration unless explicitly approved.
- Antivirus scanning, DLP, or production retention policy.
- AI review graph logic, except consuming uploaded file metadata if a later task requests it.

## Required Field Types

Add schema support for:

- `rich_text`
  - answer stores sanitized rich-text payload and plain-text fallback.
  - supports placeholder, min length, max length, and required.
- `image_upload`
  - answer stores uploaded asset ID plus metadata needed to render preview.
  - supports accepted MIME types, max file size, max count, required.
- `file_upload`
  - answer stores uploaded asset ID plus filename, MIME type, size, and download URL or signed download reference.
  - supports accepted MIME types/extensions, max file size, max count, required.

## Required Backend Behavior

- Upload endpoints require authentication and role permission appropriate to the assignment/task.
- Upload metadata is persisted and associated with the uploader and task/submission context where possible.
- File content is stored under a documented local storage root for MVP.
- Downloads enforce permissions server-side.
- Submission validation checks required upload fields and count/size/type constraints.
- Rich text is sanitized or stored in a safe structured format.

## Required Frontend Behavior

- Renderer supports rich text editing in annotation forms.
- Renderer supports image preview and upload.
- Renderer supports file upload, file list, remove, and read-only display.
- Designer exposes field properties for accepted types, max size, max count, and help text.
- Review detail renders uploaded answers in read-only mode without leaking inaccessible URLs.

## Implementation Steps

- [ ] Add backend schema models for `rich_text`, `image_upload`, and `file_upload`.
- [ ] Add upload metadata persistence and storage service if no existing service can safely store files.
- [ ] Add authenticated upload/download API routes with permission checks.
- [ ] Extend submission validation for rich-text and upload answers.
- [ ] Update `SchemaRenderer` types and rendering for new fields.
- [ ] Update designer property controls for new fields.
- [ ] Add backend tests for schema validation, upload permission, and download permission.
- [ ] Add frontend tests for rich-text entry, image upload display, file upload display, and read-only review rendering.
- [ ] Update docs and known limitations for local storage and production hardening.
- [ ] Create the standard handoff.

## Required Tests

- Template schema accepts each new field type with valid constraints.
- Template schema rejects unsupported MIME/type/count/size constraints.
- Required rich-text and upload fields fail validation when empty.
- Upload endpoint rejects unauthenticated users.
- Download endpoint denies unrelated users.
- Renderer submits rich text and upload answer payloads in the expected shape.
- Review detail displays uploaded file/image answers read-only.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_uploads.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/schema-renderer src/features/template src/features/reviewer
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

If upload tests require temporary storage, use a temp directory and report the exact environment variable or fixture used.

## Handoff Requirements

Create `docs/handoffs/<date>-task14-rich-media-fields-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Final field JSON shapes.
- Upload route list and permission behavior.
- Storage root and cleanup behavior.
- Rich-text sanitization/storage policy.
- File size/type/count limits.
- OpenAPI regeneration result.
- Backend/frontend tests and build results.
- Production storage/privacy limitations.

