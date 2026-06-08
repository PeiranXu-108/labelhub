## Agent Handoff

Agent: Human Review Operations Agent
Task file: docs/tasks/25-human-review-operations-agent.md
Status: ready for review

Changed files:
- backend/app/api/routes/review.py
- backend/app/schemas/review.py
- backend/app/services/review_operations.py
- backend/tests/test_review_api.py
- frontend/src/api/openapi.json
- frontend/src/features/reviewer/ReviewQueue.tsx
- frontend/src/features/reviewer/ReviewSubmissionDetail.tsx
- frontend/src/features/reviewer/ReviewerWorkspace.test.tsx
- frontend/src/features/reviewer/api.ts
- frontend/src/features/reviewer/types.ts
- docs/handoffs/2026-06-09-task25-human-review-operations-handoff.md

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_review_api.py tests/test_review_integration_contracts.py tests/test_multistage_review.py -q`: pass, 12 tests; existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 141 tests; existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python3 -m json.tool frontend/src/api/openapi.json`: pass.
- `cd frontend && npm test -- --run src/features/reviewer`: pass, 11 tests; existing React Router future-flag warnings.
- `cd frontend && npm test -- --run`: pass, 97 tests; existing React Router future-flag warnings and existing TemplateWorkspace act warning.
- `cd frontend && npm run build`: pass; existing Vite chunk-size warning.
- `git diff --check`: pass.

Contract changes:
- Added `GET /review/metrics` for reviewer metrics and queue-level SLA context.
- Added `GET /review/submissions/{submission_id}/audit-export` for submission-scoped review audit export.
- Added `GET /review/tasks/{task_id}/audit-export` for task-scoped review audit export.
- Added `ReviewerMetricsRead`, `ReviewerSLAContextRead`, `ReviewAuditExportRead`, and nested audit export schemas.
- No workflow status transitions were added; approve/return still go through `SubmissionService` and `WorkflowService`.
- No AI review decision logic changed.

Reviewer metric definitions:
- `reviewed_today`: count of `HumanReview` rows for the authenticated reviewer with `created_at` in the current UTC day.
- `approved_today`: count of today's authenticated-reviewer human reviews with `decision == "approve"`.
- `returned_today`: count of today's authenticated-reviewer human reviews with `decision == "return"`.
- `pass_rate`: `approved_today / reviewed_today`, rounded to 4 decimals; `null` when the reviewer has no reviews today.
- `pending_review_count`: queue-level count of submissions in `ai_passed`, `needs_human_review`, or `human_reviewing`.

SLA source and behavior:
- SLA source is `Task.deadline_at` only.
- Metrics return `nearest_deadline_at`, `seconds_until_nearest_deadline`, `overdue_count`, and `pending_with_deadline_count` across pending review submissions.
- `seconds_until_nearest_deadline` is negative when the nearest pending deadline is overdue.
- Queue UI shows metric strip, SLA table column, and overdue/pending header context.
- Detail UI derives submission SLA display from the backend task deadline already returned in review detail.

Assignment/claim policy:
- Reviewer assignment/self-claim was not implemented because there is no persisted reviewer-assignment contract, staffing policy, or ownership transition model.
- The UI does not expose fake reviewer assignment controls.
- Detail UI shows read-only review ownership context as the latest human reviewer when one exists, otherwise unassigned.
- Labeler assignment remains unchanged and separate from reviewer operations.

Direct revision policy:
- Direct reviewer revision is deferred.
- Reason: the project policy remains open, and implementing reviewer-authored answer edits would require separate audit records, preserved original labeler attempts, and a reviewer revision attempt model before any answer payload mutation.
- No direct edit/revision controls are exposed in the reviewer UI.

Audit export format/permissions:
- Export format is JSON served with `Content-Disposition` attachment filenames.
- Submission export shape: `scope`, `task_id`, `generated_at`, `submission_count`, and `submissions[]`.
- Each exported submission includes `submission`, `task`, persisted `audit_logs`, persisted `ai_reviews`, and persisted `human_reviews`.
- Task export returns the same record shape for submissions under the task.
- Reviewers can export review audit data; owners can export only tasks they own; labelers are denied.

UI consistency notes:
- Existing reviewer layout is preserved: `StudioPageHeader`, `StudioPanel`, Ant Design table/actions, `Descriptions`, `Timeline`, and `StatusPill` remain the primary structure.
- Queue metrics use the existing `MetricStrip` pattern from owner/agent surfaces.
- Final decision labels are clearer (`终审批准`, `退回修订`) while preserving current stage-aware API semantics.
- No cards were nested inside cards, and the existing right/detail surfaces remain coherent.

Blockers:
- none for implemented scope.

Requests for Supervisor:
- Decide whether reviewer assignment/self-claim should become a real persisted workflow contract.
- Decide whether direct reviewer revision should be approved, and if so define attempt preservation and audit requirements before implementation.
