# Task 09: Review Integration Contracts Agent

## Mission

Close the Task07 integration gaps by adding the backend read contracts and minimal frontend consumers needed for an auditable reviewer/labeler MVP.

This is a contract follow-up task. It must not redesign the workflow state machine or AI review graph. Its job is to expose already-persisted data, add the missing persisted attempt snapshots needed for previous-attempt diffs, and update the Task07 UI to consume those contracts without inventing local semantics.

## Dependencies

- Task 02 backend domain APIs and `WorkflowService`.
- Task 03 immutable `TemplateSchema` snapshots and `SchemaRenderer`.
- Task 04 persisted `AIReview` structured output and prompt snapshots.
- Task 07 labeler/reviewer frontend surfaces.

## Owned Areas

- `backend/app/models/` only for attempt-history persistence needed by this task.
- Alembic migrations for attempt-history persistence.
- `backend/app/schemas/labeler.py`
- `backend/app/schemas/review.py`
- `backend/app/schemas/template.py` consumption only; do not alter the frozen `TemplateDocument` shape without Supervisor approval.
- `backend/app/api/routes/labeler.py`
- `backend/app/api/routes/review.py`
- `backend/app/services/submissions.py`
- `backend/tests/test_labeler_api.py`
- `backend/tests/test_review_api.py`
- `backend/tests/test_review_integration_contracts.py` if a new focused test file is cleaner.
- `frontend/src/features/labeler/`
- `frontend/src/features/reviewer/`
- `frontend/src/routes/labeler/`
- `frontend/src/routes/review/`
- `frontend/src/api/openapi.json` generated snapshot only.

## Non-Owned Areas

- `backend/app/services/workflow.py`: do not modify transition rules unless Supervisor explicitly approves.
- `backend/app/agent/` and LangGraph nodes: do not modify AI review execution logic.
- `frontend/src/features/schema-renderer/`: consume only unless Supervisor coordinates with Template Agent.
- Export worker/storage behavior.

## Required Backend Contracts

### Frozen Template Snapshot Contract

- `GET /labeler/assignments/{assignment_id}` must include `template_schema: TemplateSchemaRead`.
- `GET /review/submissions/{submission_id}` must include `template_schema: TemplateSchemaRead`.
- Both responses must use `submission.template_schema_id`, not the task's latest template.
- If a newer template version exists for the task, assignment/review detail must still return the submission's frozen schema snapshot.

### Labeler Return Context Contract

- `GET /labeler/assignments/{assignment_id}` must include `latest_human_review: HumanReviewRead | null`.
- For returned submissions, the labeler UI must display the reviewer reason from `latest_human_review.reason`.
- Do not expose global audit search to labelers.
- Do not expose other labelers' submissions or review data.

### Reviewer Queue Contract

- `GET /review/queue` must return `ReviewQueueItemRead[]`, not bare `SubmissionRead[]`.
- Each queue item must include:
  - `submission: SubmissionRead`
  - `task: TaskRead`
  - `latest_ai_review: AIReviewRead | null`
  - `latest_human_review: HumanReviewRead | null`
- Supported query parameters:
  - `task_id`
  - `status`
  - `ai_decision`
  - `min_score`
  - `max_score`
- Filtering must be server-backed. The frontend must not filter AI decision or score from missing data.

### Reviewer Detail Contract

- `GET /review/submissions/{submission_id}` must include:
  - `submission: SubmissionRead`
  - `task: TaskRead`
  - `item: TaskItemRead`
  - `template_schema: TemplateSchemaRead`
  - `ai_reviews: AIReviewRead[]`
  - `human_reviews: HumanReviewRead[]`
  - `audit_logs: AuditLogRead[]`
  - `previous_attempts: SubmissionAttemptRead[]`
- `AIReviewRead` must expose structured, auditable AI data:
  - `id`
  - `submission_id`
  - `decision`
  - `overall_score`
  - `status`
  - `structured_response`
  - `prompt_snapshot`
  - `model_name`
  - `created_at`
- `HumanReviewRead` must expose:
  - `id`
  - `submission_id`
  - `reviewer_id`
  - `decision`
  - `reason`
  - `review_metadata`
  - `created_at`
- `SubmissionAttemptRead` must expose:
  - `id`
  - `submission_id`
  - `attempt`
  - `template_schema_id`
  - `schema_version`
  - `answer_payload`
  - `submitted_at`
  - `created_at`

### Previous Attempt Persistence

- Add persistence for submitted attempt snapshots.
- On every successful `submit_assignment`, store the submitted answer payload, current attempt number, template schema id, schema version, and submitted timestamp.
- Previous attempts in review detail must be ordered by `attempt` ascending and must not include the current attempt.
- Do not try to reconstruct historical attempts from mutable current `Submission.answer_payload`.
- Existing submissions created before this migration may have no previous attempts; return an empty list.

## Required Frontend Updates

- Labeler workbench must use `assignment.template_schema` instead of calling the current-task template endpoint for assignment rendering.
- Labeler returned revision view must display `latest_human_review.reason` when present.
- Reviewer queue must consume `ReviewQueueItemRead[]`.
- Reviewer queue AI decision and score filters must become active server-backed controls using the query parameters above.
- Reviewer detail must render AI score, decision, structured response, prompt snapshot, model name, human review comments, audit timeline, frozen template version, and previous-attempt diff/summary from backend response data.
- The frontend must continue to use `SchemaRenderer`; do not duplicate renderer logic.

## Implementation Steps

- [ ] Add or update backend schemas for `AIReviewRead`, `HumanReviewRead`, `SubmissionAttemptRead`, `ReviewQueueItemRead`, expanded `ReviewSubmissionDetail`, and expanded `AssignmentDetailRead`.
- [ ] Add attempt-history persistence and Alembic migration if no existing table can safely store submitted attempts.
- [ ] Update `SubmissionService.submit_assignment(...)` to persist attempt snapshots in the same transaction as the submit workflow transition.
- [ ] Update labeler assignment detail to return the frozen template snapshot and latest human return review.
- [ ] Update review queue to return queue items and support server-backed filters.
- [ ] Update review detail to return frozen template snapshot, AI reviews, human reviews, audit logs, and previous attempts.
- [ ] Update frontend labeler APIs/types/workbench to consume the expanded assignment response.
- [ ] Update frontend reviewer APIs/types/queue/detail to consume the expanded review contracts and activate AI decision/score filters.
- [ ] Regenerate `frontend/src/api/openapi.json`.
- [ ] Add backend and frontend regression tests for every contract above.
- [ ] Update handoff with contract changes and downstream impacts.

## Required Tests

- Assignment detail returns `template_schema` from `submission.template_schema_id` after the task has a newer published template.
- Review detail returns `template_schema` from `submission.template_schema_id` after the task has a newer published template.
- Submitted attempt snapshots are persisted on submit and previous attempts are returned on later review cycles.
- Review detail returns AI reviews with `structured_response`, `prompt_snapshot`, `model_name`, and score.
- Review detail returns human review reasons and audit logs.
- Review queue filters by `task_id`, `status`, `ai_decision`, `min_score`, and `max_score`.
- Labeler cannot read another labeler's return reason or assignment data.
- Reviewer queue/detail endpoints remain reviewer-only.
- Frontend labeler workbench renders from assignment `template_schema` and does not fetch the mutable current task template for assignment rendering.
- Frontend labeler returned revision shows reviewer reason when available.
- Frontend reviewer queue sends server-backed AI decision/score filter query params.
- Frontend reviewer detail renders AI metadata, human review reason, prompt snapshot, and previous attempts from backend response data.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_review_api.py tests/test_review_integration_contracts.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx
cd frontend && npm test -- --run
cd frontend && npm run build
docker compose config
git diff --check
```

If the local backend virtualenv lacks a dependency needed to run these commands, report the exact missing dependency and run the closest targeted tests that are available.

## Handoff Requirements

Report:

- final route list and response shapes changed
- migration name and attempt-history behavior
- OpenAPI snapshot regeneration result
- backend tests run and results
- frontend tests/build run and results
- whether any frontend route still relies on current task template instead of submission snapshot
- downstream impacts for Task08 QA Docs Deploy
- blockers or Supervisor decisions needed
