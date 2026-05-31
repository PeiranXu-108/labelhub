# LabelHub API

Source of truth: FastAPI live OpenAPI at `/openapi.json`; generated frontend snapshot at `frontend/src/api/openapi.json`.

Authentication: `/auth/login` accepts persisted demo/application users and returns a JWT bearer token. All business routes use JWT bearer auth. Tokens must include `sub` and `role`, where role is one of `owner`, `labeler`, `reviewer`, or `ai_agent`; the token subject must match a persisted user and the token role must match that user.

## Health

- `GET /health`: returns `{ "status": "ok" }`.

## Auth APIs

- `POST /auth/login`: body `{ "email": string, "password": string }`; returns `{ "access_token": string, "token_type": "bearer", "user": { "id": string, "email": string, "name": string, "role": "owner" | "labeler" | "reviewer" | "ai_agent" } }`.
- `GET /auth/me`: requires bearer auth; returns the persisted current user summary.

Invalid credentials return `401` with `INVALID_CREDENTIALS`. Missing, invalid, unknown-subject, or role-mismatched bearer tokens return `401` and do not create users implicitly.

## Owner Task APIs

- `GET /tasks`: list tasks for owners and reviewers.
- `POST /tasks`: owner creates a task.
- `GET /tasks/{task_id}`: owner, reviewer, or labeler reads task metadata.
- `PATCH /tasks/{task_id}`: owner updates editable task fields.
- `POST /tasks/{task_id}/publish`: owner transitions `draft -> published`.
- `POST /tasks/{task_id}/pause`: owner transitions `published -> paused`.
- `POST /tasks/{task_id}/end`: owner transitions active task to `ended`.
- `POST /tasks/{task_id}/items/import/preview`: owner previews and validates pasted or uploaded dataset content before commit.
- `POST /tasks/{task_id}/items/import`: owner commits validated raw task items.
- `GET /tasks/{task_id}/items`: owner or reviewer lists task items.
- `GET /tasks/{task_id}/review-config`: owner or reviewer reads AI review config.
- `PUT /tasks/{task_id}/review-config`: owner upserts review config.
- `GET /tasks/{task_id}/agent-workflow`: owner or reviewer reads task-level agent workflow status counts, AI decision counts, pending/failed counts, and recent submission workflows.

Task create/update/read payloads include expanded metadata:

```json
{
  "instruction_rich_text": { "format": "markdown", "content": "Safe markdown instructions" },
  "instruction_plain_text": "Safe searchable fallback derived by the backend",
  "tags": ["support qa", "priority"],
  "reward_rule": {
    "mode": "none | fixed_per_accepted_submission | manual",
    "currency": "USD",
    "amount": "1.25",
    "description": "Owner-visible policy text"
  },
  "quality_rules": [{ "label": "Evidence", "description": "Cite the source text." }]
}
```

`instruction_rich_text` is stored as structured safe markdown only; raw HTML tags, JavaScript URLs, HTML data URLs, and inline event handlers are rejected. Tags are trimmed, whitespace-collapsed, lower-cased, and rejected when empty or duplicated after normalization. Reward rules are metadata only: LabelHub validates mode/currency/amount consistency but does not execute payouts, maintain a payout ledger, or call payment providers.

### Dataset Import

Preview request:

```json
{
  "format": "json_array | jsonl | xlsx",
  "content": "UTF-8 text for JSON/JSONL, base64 for XLSX",
  "filename": "optional-source-name.xlsx",
  "is_base64": true,
  "excel_mapping": {
    "external_id_column": "external_id",
    "payload_column": "payload",
    "payload_columns": null
  }
}
```

Preview returns row-level `errors` and `warnings`, `valid_count`, `invalid_count`, and limits. Commit uses:

```json
{
  "items": [
    { "external_id": "row-1", "payload": { "text": "..." }, "source_row": 2 }
  ]
}
```

Supported formats:

- JSON array: either `{ "external_id": "...", "payload": { ... } }` rows, or object rows without `payload`, where all non-`external_id` fields become payload keys.
- JSONL: one JSON object per non-empty line, using the same row rules as JSON array. Invalid lines include the source line number.
- XLSX: first worksheet only, first non-empty row as headers, remaining non-empty rows as data.

Excel mapping rules:

- `external_id_column` defaults to `external_id`; blank values import as `null`.
- If `payload_column` exists and a row has a non-empty value in that column, it must contain a JSON object string and wins over tabular payload columns.
- Otherwise payload is built from `payload_columns` when provided, or from all columns except `external_id_column` and `payload_column`.
- Numeric and boolean XLSX cells are preserved as JSON numbers/booleans; date-formatted cells are not interpreted beyond their stored spreadsheet value.

Limits default to `LABELHUB_IMPORT_MAX_ROWS=5000` and `LABELHUB_IMPORT_MAX_FILE_BYTES=5242880` (5 MiB). Backend validation is authoritative even after frontend preview/editing.

Duplicate `external_id` policy: non-empty external IDs must be unique within a task and within the submitted batch. Duplicates are rejected; LabelHub does not overwrite existing items or auto-suffix IDs. Rows with `external_id: null` are allowed more than once.

Partial failure policy: preview can show mixed valid and invalid rows, but commit is all-or-nothing. If any submitted row fails validation or conflicts with an existing `external_id`, no rows from that commit are created. Import errors include row and field context when available.

## Template APIs

- `GET /tasks/{task_id}/template`: reads latest template for a task.
- `POST /tasks/{task_id}/template/draft`: owner saves a draft with body `{ "schema": <TemplateDocument> }`.
- `POST /tasks/{task_id}/template/publish`: owner publishes the current draft.

Published template schemas are immutable. Submissions store `template_schema_id` and `schema_version`.

Task 14 rich/media field additions:

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
  "acceptedMimeTypes": ["application/pdf", "text/plain"],
  "acceptedExtensions": [".pdf", ".txt"],
  "maxFileSizeBytes": 2097152,
  "maxCount": 3
}
```

Field limits are backend-enforced: `maxFileSizeBytes` must be 1 byte through 25 MiB, `maxCount` must be 1 through 10, image MIME types are limited to `image/png`, `image/jpeg`, `image/webp`, and `image/gif`, and file extensions must start with a dot. Rich-text answers use safe markdown only; raw HTML tags, JavaScript URLs, HTML data URLs, and inline event-handler patterns are rejected. The backend derives `plainText` and does not trust a client-provided fallback.

Task 16 field-level LLM assist extends `llm_trigger` fields:

```json
{
  "id": "assist_summary",
  "type": "llm_trigger",
  "label": "Generate summary",
  "promptTemplate": "Summarize {{item.payload.text}} using {{answers.sentiment}}.",
  "targetFieldId": "summary",
  "mode": "suggest | prefill | overwrite_with_confirmation",
  "outputSchema": {
    "preset": "target_field | text | number | json_object | json_array",
    "jsonSchema": { "type": "string", "maxLength": 500 }
  },
  "contextFields": ["sentiment"],
  "temperature": 0
}
```

Defaults: `mode` is `suggest`, `outputSchema.preset` is `target_field`, `contextFields` is empty, and `temperature` falls back to server-side provider configuration. `targetFieldId` must reference an answerable field, and `contextFields` must reference existing non-`llm_trigger` fields. Provider credentials are never part of template JSON or frontend code.

## Labeler APIs

- `GET /labeler/tasks`: labeler lists published marketplace tasks, including read-only task instructions, tags, reward policy, and quality rules when configured.
- `POST /labeler/tasks/{task_id}/claim`: labeler claims the next available item.
- `GET /labeler/assignments/{assignment_id}`: labeler reads assignment detail, frozen template snapshot, current submission, task metadata, item, and latest human return reason.
- `GET /labeler/assignments/{assignment_id}/agent-workflow`: labeler reads the agent workflow for their own assignment.
- `POST /labeler/assignments/{assignment_id}/uploads`: labeler uploads one file for an upload field using multipart form data with `field_id` and `file`.
- `POST /labeler/assignments/{assignment_id}/llm-assist`: labeler invokes a server-side `llm_trigger` for their own draft/returned assignment.
- `PUT /labeler/assignments/{assignment_id}/draft`: labeler saves draft answers with `{ "answer_payload": ... }`.
- `POST /labeler/assignments/{assignment_id}/submit`: labeler submits required answers with `{ "answer_payload": ... }`.
- `GET /labeler/submissions`: labeler lists own submissions.

Upload responses return public-safe metadata only:

```json
{
  "id": "asset-id",
  "task_id": "task-id",
  "assignment_id": "assignment-id",
  "submission_id": "submission-id",
  "uploader_id": "labeler-id",
  "field_id": "screenshots",
  "filename": "shot.png",
  "content_type": "image/png",
  "size_bytes": 12345,
  "download_url": "/uploads/asset-id/download",
  "created_at": "2026-05-31T00:00:00Z"
}
```

Submission answer shapes:

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
  ]
}
```

Backend submission validation rejects unknown fields, invalid option values, missing required fields, unsafe rich text, upload count/size/type violations, and upload asset IDs that do not belong to the assignment/submission with `INVALID_SUBMISSION_PAYLOAD`.

Field assist request:

```json
{
  "trigger_field_id": "assist_summary",
  "answer_payload": {
    "sentiment": "positive",
    "summary": "current draft value"
  }
}
```

Field assist success response:

```json
{
  "log_id": "assist-log-id",
  "trigger_field_id": "assist_summary",
  "target_field_id": "summary",
  "mode": "prefill",
  "status": "succeeded",
  "value": "Suggested field value",
  "rationale": "Optional model rationale",
  "confidence": 0.91,
  "model_name": "deepseek-chat",
  "created_at": "2026-05-31T00:00:00Z"
}
```

The backend builds the prompt from the frozen template snapshot, item payload, current answers, target field metadata, and optional `contextFields`. Model output must validate as the structured envelope `{ value, rationale?, confidence? }`; `value` is then checked against `outputSchema` and the target field type. Assist attempts persist `llm_field_assist_logs` plus a submission audit event with prompt snapshot, model metadata, target field, status, structured response, and failure reason. Missing provider credentials return `LLM_PROVIDER_UNAVAILABLE` without exposing secrets or stack traces.

## Upload APIs

- `GET /uploads/{asset_id}/download`: downloads uploaded image/file content after server-side permission checks.

Upload permission behavior:

- Uploads require a labeler token and the labeler must own the assignment.
- Uploads are accepted only while the submission is draft or returned.
- Uploads validate the target field against the frozen template snapshot.
- Downloads are allowed for the uploader labeler, the task owner, and reviewers.
- Unrelated labelers are denied with `PERMISSION_DENIED`.
- API responses never expose local storage paths or stored filenames.

## Review APIs

- Review stages are `initial_review`, `re_review`, and `final_review`.
- `GET /review/queue`: reviewer lists reviewable submissions. Filters: `task_id`, `status`, `ai_decision`, `min_score`, `max_score`, and `review_stage`. Queue items include `current_stage`.
- `GET /review/submissions/{submission_id}`: reviewer reads submission, task, item, frozen template schema, agent workflow, AI reviews, human reviews, `stage_history`, `round_diffs`, audit logs, and previous attempts.
- `POST /review/submissions/{submission_id}/approve`: reviewer approves a reviewable submission. Optional body `{ "stage": "final_review" }`; approvals persist as `final_review`.
- `POST /review/submissions/{submission_id}/return`: reviewer returns a submission with `{ "stage": "initial_review | re_review", "reason": "..." }`. Stage must match the current review stage.
- `POST /review/submissions/batch`: reviewer batch approves or returns submissions with optional `stage`.
- `GET /audit`: owner/reviewer audit lookup by query parameters such as `entity_type=submission&entity_id=<id>`.

Human review records expose `stage`, `round`, `decision`, `reason`, reviewer ID, review metadata, and `compared_from_attempt` / `compared_to_attempt`. Round diffs are generated only from persisted `submission_attempts` snapshots. Each diff compares adjacent attempts field-by-field, reports `added`, `removed`, or `changed`, uses template field labels when present, and falls back to the field ID plus JSON values.

## Export APIs

- `POST /tasks/{task_id}/exports`: owner creates an export job. Body: `{ "format": "json" | "jsonl" | "csv" | "xlsx", "field_mapping": {}, "include_review_metadata": true }`.
- `GET /tasks/{task_id}/exports`: owner or reviewer lists export jobs.
- `GET /exports/{export_job_id}/download`: owner or reviewer downloads a succeeded export file.

Export workers only include submissions already in `approved` or `exportable` status.
