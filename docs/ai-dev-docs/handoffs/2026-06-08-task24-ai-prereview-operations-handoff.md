## Agent Handoff

Agent: AI Pre-Review Operations Agent
Task file: docs/tasks/24-ai-prereview-operations-agent.md
Status: ready for review

Changed files:
- backend/app/api/routes/ai_operations.py
- backend/app/schemas/ai_operations.py
- backend/app/domain/enums.py
- backend/app/main.py
- backend/app/services/agent_workflow.py
- backend/app/services/ai_review.py
- backend/app/services/workflow.py
- backend/tests/test_ai_operations_api.py
- frontend/src/App.tsx
- frontend/src/api/openapi.json
- frontend/src/features/agent-workflow/AIOperationsPage.tsx
- frontend/src/features/agent-workflow/AIOperationsPage.test.tsx
- frontend/src/features/agent-workflow/aiOperationsTypes.ts
- frontend/src/features/agent-workflow/api.ts
- frontend/src/features/feedback/errors.ts
- frontend/src/features/i18n/labels.ts
- frontend/src/features/studio/index.tsx
- frontend/src/routes/ai-operations/AIOperationDetailRoute.tsx
- frontend/src/routes/ai-operations/AIOperationsRoute.tsx
- frontend/src/routes/owner/OwnerTaskDetailRoute.tsx

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py tests/test_agent_workflow_api.py -q`: pass, 15 tests, existing passlib `crypt` deprecation warning.
- `cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py tests/test_agent_workflow_api.py tests/test_ai_operations_api.py -q`: pass, 20 tests, existing passlib `crypt` deprecation warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 138 tests, existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python3 -m json.tool frontend/src/api/openapi.json`: pass.
- `cd frontend && npm test -- --run src/features/agent-workflow src/features/reviewer`: pass, 11 tests, existing React Router future-flag warnings.
- `cd frontend && npm test -- --run`: pass, 94 tests, existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, existing Vite chunk-size warning.
- `git diff --check`: pass.

Contract changes:
- Added `GET /ai-operations/runs`.
- Added `GET /ai-operations/runs/{submission_id}`.
- Added `POST /ai-operations/runs/{submission_id}/retry`.
- Added `SubmissionAction.RETRY_AI_REVIEW` with `needs_human_review -> ai_reviewing` through `WorkflowService`.
- Added OpenAPI schemas for AI operation run list/detail/retry responses.

Blockers:
- none

Requests for Supervisor:
- Review whether owner visibility should remain scoped to tasks created by the owner, as implemented, or broaden to all owner-role users.

AI operations route list and filters:
- `GET /ai-operations/runs`
  - Filters: `run_status=pending|running|passed|returned|human_review|failed`, `task_id=<id>`, `ai_decision=pass|return|human_review`.
  - Queue fields include submission ID, task ID/name, labeler, attempt, run status, workflow status, current review stage, AI decision/score, model name, model retry count, operator retry count, idempotency key, latest review ID/status, submitted/run/update timestamps.
- `GET /ai-operations/runs/{submission_id}`
  - Returns the queue fields plus submission, task, item, frozen template schema, review config, workflow steps, latest AI review, all AI review records, audit logs, processing logs, item payload, answer payload, score dimensions, and verdict summary/reasons/suggestions.
- `POST /ai-operations/runs/{submission_id}/retry`
  - Returns `{ retry_performed, detail }` where `detail` is the same shape as the detail endpoint.

Detail payload shape:
- Top-level run metadata: `submission_id`, `task_id`, `task_name`, `labeler_id`, `attempt`, `run_status`, `workflow_status`, `current_stage`, `idempotency_key`, retry counts, timestamps.
- Context objects: `submission`, `task`, `item`, `template_schema`, `review_config`, `agent_workflow`.
- AI audit objects: `latest_ai_review`, `ai_reviews`, `audit_logs`, `processing_logs`.
- Payload views: `item_payload`, `answer_payload`.
- Structured result views: `score_dimensions`, `verdict`, plus full `structured_response`, `prompt_snapshot`, `raw_provider_response`, and `error_metadata` on each AI review.

Retry/idempotency policy:
- Idempotency remains `submission_id:attempt`.
- `AIReviewService.review_submission()` still returns any existing `completed` or `failed` review for the same idempotency key during normal execution.
- Operations retry first checks for a completed review with the same idempotency key. If present, it returns that review with `retry_performed=false` and does not create a duplicate.
- Operations retry only retries a failed review for the current idempotency key.
- The failed review is marked `status="superseded"` with `error_metadata.superseded_by_retry=true`; this is the explicit retry marker.
- The submission is moved from `needs_human_review` to `ai_reviewing` through `WorkflowService` action `retry_ai_review`, and the new AI run uses the existing LangGraph/structured-output persistence path.
- Superseded reviews are kept in detail history but excluded from latest-review and workflow-summary selection.

Missing-provider behavior:
- Missing provider credentials still use the existing `MissingCredentialsReviewModel`.
- Retry with missing credentials creates a controlled failed AI review with `decision=human_review`, failure reason in `error_metadata`, and workflow fallback back to `needs_human_review`.
- No provider credentials or secret controls are exposed in frontend code; model metadata only exposes non-secret provider/model/base URL/temperature/credential-presence fields already persisted by backend.

Permissions:
- `OWNER` and `REVIEWER` can read operations queue/detail and retry.
- `LABELER` is denied.
- Owners are scoped to submissions for tasks where `Task.created_by == actor.user_id`.
- Reviewers can inspect all AI operations, matching existing reviewer queue visibility.

UI consistency notes:
- Added `/ai-operations` and `/ai-operations/runs/:submissionId` routes without redesigning the existing reviewer queue.
- The page reuses existing `StudioPageHeader`, `StudioPanel`, `StatusPill`, `MetricStrip`, `JsonViewer`, Ant Design table/descriptions/timeline, and `AgentWorkflowTimeline`.
- Owner task detail links into `/ai-operations?task_id=<task_id>`; reviewer route remains unchanged.
