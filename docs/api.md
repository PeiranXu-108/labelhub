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
- `POST /tasks/{task_id}/items/import`: owner imports raw task items.
- `GET /tasks/{task_id}/items`: owner or reviewer lists task items.
- `GET /tasks/{task_id}/review-config`: owner or reviewer reads AI review config.
- `PUT /tasks/{task_id}/review-config`: owner upserts review config.
- `GET /tasks/{task_id}/agent-workflow`: owner or reviewer reads task-level agent workflow status counts, AI decision counts, pending/failed counts, and recent submission workflows.

## Template APIs

- `GET /tasks/{task_id}/template`: reads latest template for a task.
- `POST /tasks/{task_id}/template/draft`: owner saves a draft with body `{ "schema": <TemplateDocument> }`.
- `POST /tasks/{task_id}/template/publish`: owner publishes the current draft.

Published template schemas are immutable. Submissions store `template_schema_id` and `schema_version`.

## Labeler APIs

- `GET /labeler/tasks`: labeler lists published marketplace tasks.
- `POST /labeler/tasks/{task_id}/claim`: labeler claims the next available item.
- `GET /labeler/assignments/{assignment_id}`: labeler reads assignment detail, frozen template snapshot, current submission, task, item, and latest human return reason.
- `GET /labeler/assignments/{assignment_id}/agent-workflow`: labeler reads the agent workflow for their own assignment.
- `PUT /labeler/assignments/{assignment_id}/draft`: labeler saves draft answers with `{ "answer_payload": ... }`.
- `POST /labeler/assignments/{assignment_id}/submit`: labeler submits required answers with `{ "answer_payload": ... }`.
- `GET /labeler/submissions`: labeler lists own submissions.

Backend submission validation rejects unknown fields, invalid option values, and missing required fields with `INVALID_SUBMISSION_PAYLOAD`.

## Review APIs

- `GET /review/queue`: reviewer lists reviewable submissions. Filters: `task_id`, `status`, `ai_decision`, `min_score`, `max_score`.
- `GET /review/submissions/{submission_id}`: reviewer reads submission, task, item, frozen template schema, agent workflow, AI reviews, human reviews, audit logs, and previous attempts.
- `POST /review/submissions/{submission_id}/approve`: reviewer approves a reviewable submission.
- `POST /review/submissions/{submission_id}/return`: reviewer returns a submission with `{ "reason": "..." }`.
- `POST /review/submissions/batch`: reviewer batch approves or returns submissions.
- `GET /audit`: owner/reviewer audit lookup by query parameters such as `entity_type=submission&entity_id=<id>`.

## Export APIs

- `POST /tasks/{task_id}/exports`: owner creates an export job. Body: `{ "format": "json" | "jsonl" | "csv" | "xlsx", "field_mapping": {}, "include_review_metadata": true }`.
- `GET /tasks/{task_id}/exports`: owner or reviewer lists export jobs.
- `GET /exports/{export_job_id}/download`: owner or reviewer downloads a succeeded export file.

Export workers only include submissions already in `approved` or `exportable` status.
