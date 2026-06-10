## Agent Handoff

Agent: Labeler Navigation Agent
Task file: docs/tasks/17-labeler-navigation-agent.md
Status: ready for review

Changed files:
- backend/app/api/routes/labeler.py
- backend/app/schemas/labeler.py
- backend/app/services/submissions.py
- backend/tests/test_labeler_navigation.py
- frontend/src/api/openapi.json
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/labeler/LabelerWorkspace.test.tsx
- frontend/src/features/labeler/api.ts
- frontend/src/features/labeler/types.ts
- docs/handoffs/2026-05-31-task17-labeler-navigation-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_labeler_navigation.py -q: pass, 13 tests, existing passlib `crypt` deprecation warning.
- cd backend && ./.venv313/bin/pytest -q: pass, 113 tests, existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Review fix verification: cd backend && ./.venv313/bin/pytest tests/test_labeler_navigation.py::test_skipped_assignment_cannot_be_edited_or_submitted -q: pass.
- Review fix verification: cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_labeler_navigation.py -q: pass, 14 tests, existing passlib `crypt` deprecation warning.
- Review fix verification: cd backend && ./.venv313/bin/pytest -q: pass, 114 tests, existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass, regenerated `frontend/src/api/openapi.json`.
- python -m json.tool frontend/src/api/openapi.json: not run successfully because this host has no `python` executable on PATH.
- python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task17-openapi-python3.json: pass.
- cd frontend && npm test -- --run src/features/labeler: pass, 10 tests, existing React Router future-flag warnings.
- cd frontend && npm test -- --run: pass, 10 files and 74 tests, existing React Router future-flag warnings.
- cd frontend && npm run build: pass, existing Vite chunk-size warning.
- git diff --check: pass.

Contract changes:
- Added `GET /labeler/assignments/{assignment_id}/navigation`.
- Added `POST /labeler/assignments/{assignment_id}/previous`.
- Added `POST /labeler/assignments/{assignment_id}/next`.
- Added `POST /labeler/assignments/{assignment_id}/skip`.
- Added `AssignmentNavigationRead`, `AssignmentNavigationMoveRead`, and `SkipAssignmentRequest` schemas.
- Regenerated OpenAPI snapshot.

Navigation route list and response shapes:
- `GET /labeler/assignments/{assignment_id}/navigation` returns:
  `{ assignment_id, task_id, previous_assignment_id, next_assignment_id, can_claim_next, has_previous, has_next, no_work_left }`.
- `POST /labeler/assignments/{assignment_id}/previous` returns:
  `{ direction: "previous", assignment: AssignmentDetailRead | null, navigation: AssignmentNavigationRead | null, no_work_left, message, skipped_assignment_id: null, skip_reason: null }`.
- `POST /labeler/assignments/{assignment_id}/next` returns the same move shape with `direction: "next"`. It returns `assignment: null` and `no_work_left: true` when no owned or safely claimable next item exists.
- `POST /labeler/assignments/{assignment_id}/skip` accepts `{ reason?: string | null }` and returns the same move shape with `direction: "skip"`, plus `skipped_assignment_id` and normalized `skip_reason`.
- Move responses include `AssignmentDetailRead` when a target exists, preserving the frozen `template_schema` snapshot in the response contract.

Skip policy and audit behavior:
- Skip is allowed only for the owning labeler and only while the submission is still `draft`.
- Skip does not call submit, does not create `SubmissionAttempt`, and does not transition submission workflow status.
- Skipped assignments are closed to subsequent draft-save and submit API calls; both now return `INVALID_TRANSITION`.
- Skip marks `Assignment.status` and `TaskItem.status` as `skipped`, then moves to the next owned assignment or safely claims the next unassigned item after the skipped item.
- Skip writes an `audit_logs` row with `entity_type="assignment"`, `action="skip"`, `from_status`, `to_status="skipped"`, optional reason, and details containing `task_id`, `item_id`, `submission_id`, and `next_assignment_id`.
- Reward/penalty effects are not implemented and remain deferred to an explicit reward-policy decision.

Draft preservation behavior:
- Workbench autosave remains in place.
- Previous/next/skip now run an immediate draft save first when local answers are dirty.
- If that save fails, the workbench asks for confirmation before leaving; cancel keeps the labeler on the current assignment.
- Skip confirmation states that the draft is preserved and no annotation is submitted.

No-work-left behavior:
- Navigation state disables previous/next buttons when no target exists.
- A no-work-left info state appears when there is no next owned or safely claimable assignment.
- `POST /next` and `POST /skip` return `assignment: null` with `no_work_left: true` when the current task queue is exhausted.

Blockers:
- none

Requests for Supervisor:
- Review skip policy choice: skipped assignments/items stay marked `skipped` and are not released back to other labelers in this MVP.
