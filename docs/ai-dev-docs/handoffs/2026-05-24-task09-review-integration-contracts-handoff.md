# Task 09 Review Integration Contracts Handoff - 2026-05-24

## Agent Handoff

Agent: Review Integration Contracts Agent
Task file: docs/tasks/09-review-integration-contracts-agent.md
Status: ready for review

Changed files:
- backend/alembic/versions/20260524_0002_submission_attempt_history.py
- backend/app/api/routes/labeler.py
- backend/app/api/routes/review.py
- backend/app/models/__init__.py
- backend/app/schemas/labeler.py
- backend/app/schemas/review.py
- backend/app/services/submissions.py
- backend/tests/test_review_integration_contracts.py
- frontend/src/api/openapi.json
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/labeler/LabelerWorkspace.test.tsx
- frontend/src/features/labeler/api.ts
- frontend/src/features/labeler/types.ts
- frontend/src/features/reviewer/ReviewQueue.tsx
- frontend/src/features/reviewer/ReviewSubmissionDetail.tsx
- frontend/src/features/reviewer/ReviewerWorkspace.test.tsx
- frontend/src/features/reviewer/api.ts
- frontend/src/features/reviewer/types.ts
- docs/handoffs/2026-05-24-task09-review-integration-contracts-handoff.md

Pre-existing mixed working-tree changes not owned by Task09:
- docs/agent-coordination.md
- docs/agent-prompts.md
- docs/status-board.md
- docs/tasks/08-qa-docs-deploy-agent.md
- docs/tasks/09-review-integration-contracts-agent.md
- docs/handoffs/2026-05-24-task07-labeler-reviewer-frontend-handoff.md
- docs/reviews/2026-05-24-task07-labeler-reviewer-frontend-review.md
- docs/reviews/2026-05-24-task07-labeler-reviewer-frontend-final-review.md
- docs/reviews/2026-05-24-task09-review-integration-contracts-review.md
- frontend/src/App.tsx
- frontend/src/routes/LabelerTasksPage.tsx
- frontend/src/routes/ReviewQueuePage.tsx
- frontend/src/routes/labeler/LabelerAssignmentRoute.tsx
- frontend/src/routes/labeler/LabelerTasksRoute.tsx
- frontend/src/routes/review/ReviewQueueRoute.tsx
- frontend/src/routes/review/ReviewSubmissionRoute.tsx
- frontend/src/styles.css

Final route list and response shape changes:
- GET /labeler/assignments/{assignment_id}: returns AssignmentDetailRead with item, submission, task, template_schema, and latest_human_review. template_schema is loaded from submission.template_schema_id.
- GET /review/queue: returns ReviewQueueItemRead[] instead of SubmissionRead[]. Each item has submission, task, latest_ai_review, and latest_human_review.
- GET /review/queue query parameters: task_id, status, ai_decision, min_score, max_score. AI decision and score filters are server-backed.
- GET /review/submissions/{submission_id}: returns ReviewSubmissionDetail with submission, task, item, template_schema, ai_reviews, human_reviews, audit_logs, and previous_attempts. template_schema is loaded from submission.template_schema_id.
- POST /labeler/assignments/{assignment_id}/submit: response shape remains SubmissionRead, but successful submit now persists a SubmissionAttempt snapshot in the same transaction.
- Existing review mutation routes remain unchanged: POST /review/submissions/{submission_id}/approve, POST /review/submissions/{submission_id}/return, and POST /review/submissions/batch.

Migration name and attempt-history behavior:
- Migration: 20260524_0002_submission_attempt_history.py.
- New table: submission_attempts.
- Unique constraint: uq_submission_attempts_submission_attempt on submission_id and attempt.
- On every successful submit_assignment, SubmissionService stores submission_id, attempt, template_schema_id, schema_version, answer_payload, and submitted_at.
- Review detail previous_attempts returns persisted SubmissionAttempt rows ordered by attempt ascending and excludes the current attempt.
- Existing submissions created before the migration may have no attempt snapshots; review detail returns an empty previous_attempts list in that case.

OpenAPI regeneration result:
- Regenerated with cd backend && ./.venv313/bin/python scripts/export_openapi.py.
- frontend/src/api/openapi.json validates with python -m json.tool.
- OpenAPI now includes AssignmentDetailRead.template_schema/latest_human_review, ReviewQueueItemRead, AIReviewRead, HumanReviewRead, SubmissionAttemptRead, and expanded ReviewSubmissionDetail.

Frontend template snapshot behavior:
- Labeler workbench now renders from assignment.template_schema and does not fetch GET /tasks/{task_id}/template for assignment rendering.
- Reviewer detail now renders from review detail template_schema and does not fetch the mutable current task template.
- No Task09-owned labeler or reviewer frontend route still relies on a mutable current task template instead of the submission snapshot.

Package manager/dependency changes:
- none.
- No backend or frontend dependencies were added or removed.

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_review_api.py tests/test_review_integration_contracts.py -q: pass, 8 tests passed, 1 existing Pydantic alias warning.
- cd backend && ./.venv313/bin/pytest -q: pass, 40 tests passed, 1 existing Pydantic alias warning.
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass.
- python -m json.tool frontend/src/api/openapi.json: pass.
- cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx: pass, 2 files and 8 tests passed, with existing React Router future-flag warnings.
- cd frontend && npm test -- --run: pass, 7 files and 22 tests passed, with existing React Router future-flag warnings.
- cd frontend && npm run build: pass, with existing Vite chunk-size warning.
- docker compose config: pass.
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task09_attempt_history.sqlite ./.venv313/bin/alembic upgrade head: pass, applied 20260524_0002.
- git diff --check: pass.

Contract changes:
- Labeler assignment detail now exposes frozen template snapshot and labeler-safe latest human return reason.
- Review queue now exposes latest AI/human review summaries and server-backed filters.
- Reviewer detail now exposes structured AI review data, human review records, persisted audit logs, frozen template snapshot, and persisted previous submitted attempts.
- Submitted attempt-history persistence added through SubmissionService without changing WorkflowService transition rules.
- AI review data remains structured persisted data; no frontend or backend parsing of free-form AI text was added.
- Human review and audit data are returned from persisted backend records.

Downstream impacts for Task08:
- Task08 QA can cover exact historical template rendering for labeler/reviewer detail without relying on the mutable latest task template.
- Task08 QA can cover labeler-safe returned reasons from latest_human_review.
- Task08 QA can cover reviewer queue AI decision and score filters through backend query params.
- Task08 QA can cover reviewer detail AI metadata, human review reasons, audit timeline, and previous-attempt snapshots.
- Task08 setup must run Alembic migrations through 20260524_0002 before attempt-history E2E cases.

Blockers:
- none.

Requests for Supervisor:
- Re-review Task09 with this formal handoff present.
- If the handoff matches the verified implementation, approve Task09 and unblock Task08 QA Docs Deploy.
