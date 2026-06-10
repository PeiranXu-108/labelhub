## Agent Handoff

Agent: Rich Text and Media Fields Agent
Task file: docs/tasks/14-rich-media-fields-agent.md
Status: ready for review; P2 designer/backend upload-list parity follow-up addressed

Changed files:
- backend/alembic/versions/20260531_0005_upload_assets.py
- backend/app/api/routes/uploads.py
- backend/app/core/config.py
- backend/app/main.py
- backend/app/models/__init__.py
- backend/app/schemas/template.py
- backend/app/schemas/upload.py
- backend/app/services/submissions.py
- backend/app/services/templates.py
- backend/app/services/uploads.py
- backend/app/storage/__init__.py
- backend/app/storage/local.py
- backend/pyproject.toml
- backend/tests/test_template_schema.py
- backend/tests/test_uploads.py
- docs/api.md
- docs/deployment.md
- docs/known-limitations.md
- frontend/src/api/openapi.json
- frontend/src/features/auth/http.ts
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/reviewer/ReviewSubmissionDetail.tsx
- frontend/src/features/reviewer/ReviewerWorkspace.test.tsx
- frontend/src/features/schema-renderer/SchemaRenderer.test.tsx
- frontend/src/features/schema-renderer/SchemaRenderer.tsx
- frontend/src/features/schema-renderer/index.ts
- frontend/src/features/schema-renderer/types.ts
- frontend/src/features/template/TemplateDesigner.test.tsx
- frontend/src/features/template/TemplatePropertyInspector.tsx
- frontend/src/features/template/templateDesignerModel.ts
- frontend/src/styles.css

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_uploads.py -q: pass, 14 tests, existing passlib/Pydantic warnings.
- cd backend && ./.venv313/bin/pytest -q: pass, 91 tests, existing passlib/Pydantic warnings.
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass, wrote frontend/src/api/openapi.json.
- python -m json.tool frontend/src/api/openapi.json: not run successfully because this host has no `python` executable on PATH (`zsh: command not found: python`).
- python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task14-openapi.json: pass.
- cd frontend && npm test -- --run src/features/schema-renderer src/features/template src/features/reviewer: pass, 3 files and 20 tests, existing React Router future-flag warnings.
- cd frontend && npm test -- --run src/features/template/TemplateDesigner.test.tsx: pass, 11 tests.
- cd frontend && npm test -- --run src/features/template: pass, 1 file and 11 tests.
- cd frontend && npm test -- --run: pass, 10 files and 55 tests, existing React Router future-flag warnings.
- cd frontend && npm run build: pass, with existing Vite chunk-size warning.
- git diff --check: pass.

Contract changes:
- Template schema adds `rich_text`, `image_upload`, and `file_upload` field discriminators.
- New upload metadata table: `upload_assets`.
- New upload routes: `POST /labeler/assignments/{assignment_id}/uploads` and `GET /uploads/{asset_id}/download`.
- `SubmissionService` now stores normalized answer payloads returned by backend validation for rich text and uploaded asset metadata.
- `LABELHUB_UPLOAD_STORAGE_PATH` configures local MVP upload storage.
- `python-multipart==0.0.20` added for FastAPI multipart upload parsing.

Blockers:
- none

Requests for Supervisor:
- Review upload permission scope: current behavior allows uploader labeler, task owner, and any reviewer to download assets, matching existing reviewer broad task access.
- Confirm before production use whether uploads should move from local filesystem storage to object storage with lifecycle, retention, malware scanning, and DLP policies.

Final field JSON shapes:

```json
{
  "id": "rationale",
  "type": "rich_text",
  "label": "Rationale",
  "required": true,
  "placeholder": "Use safe markdown",
  "minLength": 3,
  "maxLength": 500,
  "plainTextFallback": true
}
```

```json
{
  "id": "screenshots",
  "type": "image_upload",
  "label": "Screenshots",
  "required": true,
  "acceptedMimeTypes": ["image/png", "image/jpeg"],
  "maxFileSizeBytes": 1048576,
  "maxCount": 2
}
```

```json
{
  "id": "attachments",
  "type": "file_upload",
  "label": "Attachments",
  "required": false,
  "acceptedMimeTypes": ["application/pdf", "text/plain"],
  "acceptedExtensions": [".pdf", ".txt"],
  "maxFileSizeBytes": 2097152,
  "maxCount": 3
}
```

Final answer payload shapes:

```json
{
  "rationale": {
    "format": "markdown",
    "content": "**Good** evidence",
    "plainText": "Good evidence"
  },
  "screenshots": [
    {
      "assetId": "asset-id",
      "filename": "shot.png",
      "contentType": "image/png",
      "sizeBytes": 12345,
      "downloadUrl": "/uploads/asset-id/download"
    }
  ],
  "attachments": [
    {
      "assetId": "asset-id",
      "filename": "evidence.txt",
      "contentType": "text/plain",
      "sizeBytes": 2345,
      "downloadUrl": "/uploads/asset-id/download"
    }
  ]
}
```

Upload/download routes and permissions:
- `POST /labeler/assignments/{assignment_id}/uploads`: requires labeler JWT; labeler must own the assignment; submission must be draft or returned; multipart body is `field_id` plus `file`; target field must be an upload field in the frozen template snapshot; file type and size are checked before storage.
- `GET /uploads/{asset_id}/download`: requires owner, labeler, or reviewer JWT; uploader labeler may download; unrelated labelers are denied; task owner may download; reviewers may download; missing files return `UPLOAD_FILE_MISSING`.
- API responses expose `download_url` but never expose `storage_path` or `stored_filename`.

Storage root and cleanup behavior:
- Root defaults to `storage/uploads`, overrideable by `LABELHUB_UPLOAD_STORAGE_PATH`.
- Files are written under `<storage_root>/<task_id>/<assignment_id>/`.
- Upload metadata is persisted in `upload_assets` and linked to task, assignment, submission where available, uploader, and field id.
- MVP cleanup is manual. There is no automatic file deletion when submissions/assets/tasks are deleted.

Rich-text sanitization/storage policy:
- Rich text is safe structured markdown: `{ "format": "markdown", "content": string, "plainText": string }`.
- Backend strips surrounding whitespace, rejects raw HTML tags, `javascript:` URLs, `data:text/html`, and inline event handler patterns.
- Backend derives and stores `plainText`; client-provided `plainText` is ignored during normalization.

Size/type/count limits:
- `maxFileSizeBytes`: 1 byte through 25 MiB per field.
- `maxCount`: 1 through 10 assets per field.
- `acceptedMimeTypes`: 1 through 20 entries, enforced by backend schema validation and designer validation.
- `acceptedExtensions`: 0 through 20 entries for `file_upload`, enforced by backend schema validation and designer validation.
- `image_upload` MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
- `file_upload` MIME types must be concrete MIME strings; extensions are optional but, when present, must start with a dot.
- Submission validation rechecks count, asset ownership, field id, MIME type, extension, and size.

Production storage/privacy limitations:
- Local upload storage is MVP-only.
- No antivirus, DLP, content moderation, automatic retention, legal hold, object storage durability, or signed URL lifecycle is implemented.
- Production file/image collection needs a user-approved object storage and retention/privacy policy.
