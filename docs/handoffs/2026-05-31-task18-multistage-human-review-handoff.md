## Agent Handoff

Agent: Multistage Human Review Agent
Task file: docs/tasks/18-multistage-human-review-agent.md
Status: ready for review

Changed files:
- backend/alembic/versions/20260531_0007_multistage_human_review.py
- backend/app/api/routes/labeler.py
- backend/app/api/routes/review.py
- backend/app/domain/enums.py
- backend/app/models/__init__.py
- backend/app/schemas/review.py
- backend/app/schemas/submission.py
- backend/app/services/review_stages.py
- backend/app/services/submissions.py
- backend/app/services/workflow.py
- backend/tests/test_multistage_review.py
- backend/tests/test_multistage_review_migration.py
- docs/api.md
- docs/demo-script.md
- docs/handoffs/2026-05-31-task18-multistage-human-review-handoff.md
- frontend/src/api/openapi.json
- frontend/src/features/i18n/labels.ts
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/labeler/LabelerWorkspace.test.tsx
- frontend/src/features/labeler/types.ts
- frontend/src/features/reviewer/ReviewQueue.tsx
- frontend/src/features/reviewer/ReviewSubmissionDetail.tsx
- frontend/src/features/reviewer/ReviewerWorkspace.test.tsx
- frontend/src/features/reviewer/api.ts
- frontend/src/features/reviewer/types.ts

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_review_api.py tests/test_review_integration_contracts.py tests/test_multistage_review.py tests/test_multistage_review_migration.py -q`: pass, 10 tests, existing passlib `crypt` and Pydantic alias warnings.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 119 tests, existing passlib `crypt` and Pydantic alias warnings.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python -m json.tool frontend/src/api/openapi.json`: not run successfully; this host has no `python` executable on PATH.
- `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task18-openapi-python3.json`: pass.
- `cd frontend && npm test -- --run src/features/reviewer src/features/labeler`: pass, 18 tests, existing React Router future-flag warnings.
- `cd frontend && npm test -- --run`: pass, 75 tests, existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `git diff --check`: pass.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////tmp/labelhub_task18_multistage_review.sqlite ./.venv313/bin/alembic upgrade head`: pass through `20260531_0007`.

Contract changes:
- Added `ReviewStage`: `initial_review`, `re_review`, `final_review`.
- `SubmissionRead` now includes `review_stage`.
- `HumanReviewRead` now includes `stage`, `round`, `compared_from_attempt`, and `compared_to_attempt`.
- `GET /review/queue` accepts `review_stage` and returns `current_stage`.
- `GET /review/submissions/{submission_id}` returns `current_stage`, `stage_history`, and `round_diffs`.
- Approve/return bodies accept optional `stage`; returns must match the active `initial_review` or `re_review`, and approvals persist as `final_review`.

Blockers:
- none

Requests for Supervisor:
- Required review for enum/workflow changes in `backend/app/domain/enums.py` and `backend/app/services/workflow.py`.

Final review stage enum and transition policy:
- Active human review stage is derived from persisted `submissions.review_stage` when present, otherwise from status/attempt.
- First human reviewable attempt uses `initial_review`.
- A returned submission reopened by a labeler advances to `re_review` through `WorkflowService` on `REOPEN`.
- Return decisions persist the active `initial_review` or `re_review` stage.
- Approval decisions are terminal and persist as `final_review`; invalid approval stage payloads are rejected with `INVALID_REVIEW_STAGE`.

Migration and backfill behavior:
- Migration `20260531_0007_multistage_human_review` adds `submissions.review_stage` plus `human_reviews.stage`, `round`, `compared_from_attempt`, and `compared_to_attempt`.
- Existing approved/exportable submissions backfill to `final_review`.
- Existing reviewable/returned submissions backfill to `initial_review` for attempt 1 and `re_review` for later attempts.
- Existing human reviews backfill their `round` and comparison attempts from persisted `submission_attempts.submitted_at <= human_reviews.created_at`.
- Existing approve human reviews backfill to `final_review`; return reviews backfill to `initial_review` or `re_review` based on that timestamp-derived review attempt. If no attempt snapshot predates a review, comparison metadata stays null instead of being invented from the mutable current submission.

Queue/detail contract changes:
- Queue items expose `current_stage` and can be server-filtered with `review_stage`.
- Reviewer queue approve/return actions refetch the server-backed queue after mutation so stale `current_stage` values are not displayed under active filters.
- Detail exposes `stage_history` in round order and `round_diffs` for adjacent persisted submission attempts.
- Reviewer UI shows stage filter, stage column, stage timeline, and round diff table.
- Labeler returned-revision alert includes the latest human review stage and reason.

Diff algorithm:
- Backend queries persisted `submission_attempts` up to the current attempt and compares adjacent snapshots.
- It never reconstructs prior rounds from mutable `Submission.answer_payload`.
- Per field, it unions persisted answer keys and emits only `added`, `removed`, or `changed` entries.
- Field labels come from the frozen template schema fields; unknown fields fall back to the field ID and raw JSON values.

WorkflowService changes and tests:
- `WorkflowService.transition_submission` applies `metadata["review_stage"]` to `Submission.review_stage` during the same transaction/audit flush as status changes.
- `REOPEN` advances returned submissions to `re_review` inside `WorkflowService`.
- Focused tests cover initial review queue filtering/return metadata, re-review attempt history and diff output, final review approval persistence, invalid stage rejection, and default terminal approval.
