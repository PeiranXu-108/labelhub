# Task 07 Labeler/Reviewer Frontend Handoff - 2026-05-24

## Agent Handoff

Agent: Labeler and Reviewer Frontend Agent
Task file: docs/tasks/07-frontend-labeler-reviewer-agent.md
Status: ready for review

Changed files:
- frontend/src/App.tsx
- frontend/src/features/labeler/LabelerMarketplace.tsx
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/labeler/LabelerWorkspace.test.tsx
- frontend/src/features/labeler/api.ts
- frontend/src/features/labeler/types.ts
- frontend/src/features/reviewer/ReturnReasonModal.tsx
- frontend/src/features/reviewer/ReviewQueue.tsx
- frontend/src/features/reviewer/ReviewSubmissionDetail.tsx
- frontend/src/features/reviewer/ReviewerWorkspace.test.tsx
- frontend/src/features/reviewer/api.ts
- frontend/src/features/reviewer/types.ts
- frontend/src/routes/LabelerTasksPage.tsx
- frontend/src/routes/ReviewQueuePage.tsx
- frontend/src/routes/labeler/LabelerAssignmentRoute.tsx
- frontend/src/routes/labeler/LabelerTasksRoute.tsx
- frontend/src/routes/review/ReviewQueueRoute.tsx
- frontend/src/routes/review/ReviewSubmissionRoute.tsx
- frontend/src/styles.css
- docs/handoffs/2026-05-24-task07-labeler-reviewer-frontend-handoff.md

Route list:
- /labeler/tasks
- /labeler/assignments/:assignmentId
- /review/queue
- /review/submissions/:submissionId

API endpoints consumed:
- GET /labeler/tasks
- POST /labeler/tasks/{task_id}/claim
- GET /labeler/assignments/{assignment_id}
- PUT /labeler/assignments/{assignment_id}/draft
- POST /labeler/assignments/{assignment_id}/submit
- GET /labeler/submissions
- GET /tasks/{task_id}/template
- GET /review/queue
- GET /review/submissions/{submission_id}
- POST /review/submissions/{submission_id}/approve
- POST /review/submissions/{submission_id}/return
- POST /review/submissions/batch
- GET /audit?entity_type=submission&entity_id={submission_id}

Schema renderer assumptions:
- The labeler workbench uses `SchemaRenderer({ schema, item, initialAnswers, onChange, onSubmit })`.
- `SchemaRenderer` owns required-field frontend validation and only calls `onSubmit` after required fields pass.
- The workbench passes the assignment item as `{ id, external_id, payload }` and submission `answer_payload` as `initialAnswers`.
- Current backend contract exposes `GET /tasks/{task_id}/template`, not a versioned template snapshot endpoint by `template_schema_id` or `schema_version`. The UI warns if the returned template version differs from the submission schema version and documents this as a blocker rather than silently pretending historical rendering is exact.

Autosave debounce behavior:
- Draft autosave runs 900 ms after the latest `SchemaRenderer.onChange`.
- User input is written to local React state immediately before any API call.
- Pending debounce timers are cancelled on newer edits.
- Submit sends the latest local answer payload directly, so an unsaved debounce cannot drop the user's current input.
- Autosave errors are surfaced in-page and do not clear local answers.

Verification run:
- cd frontend && npm test -- --run src/features/reviewer/ReviewerWorkspace.test.tsx: pass, 4 tests passed, including the regression that return success refreshes persisted audit data without displaying a fabricated local audit event.
- cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx: pass, 7 tests passed.
- cd frontend && npm test -- --run: pass, 7 files / 21 tests passed.
- cd frontend && npm run build: pass, with existing Vite chunk-size warning for the main bundle.
- Browser validation with bundled Playwright + local Google Chrome against http://127.0.0.1:5173 using contract-shaped API interception: pass. Events observed: claim, draft, submit, approve, return.
- Browser screenshots: /private/tmp/labelhub-task07-labeler-submit.png and /private/tmp/labelhub-task07-reviewer-return.png.

Contract changes:
- none.
- Task07 consumes existing OpenAPI/backend contracts and does not modify backend routes, schema renderer contracts, workflow services, or generated OpenAPI.
- Reviewer return no longer synthesizes audit timeline entries in frontend state; after `POST /review/submissions/{submission_id}/return` succeeds, it refreshes `GET /audit?entity_type=submission&entity_id={submission_id}` and renders only returned backend audit data.

API contract mismatches or limitations:
- `GET /review/submissions/{submission_id}` currently exposes only `submission`, `task`, and `item`; it does not expose AI review records, `overall_score`, `structured_response`, `prompt_snapshot`, `model_name`, human review records, or previous attempts. Reviewer detail renders explicit "not exposed by current API" notices for those unavailable sections instead of inventing mock data.
- `GET /review/queue` returns `SubmissionRead[]` only; it does not expose AI decision or score, so AI decision and score-range filters are visible but disabled with explanatory tooltips.
- Labeler/reviewer frontend cannot retrieve the immutable template snapshot for a specific `template_schema_id`; exact historical rendering needs a backend endpoint or expanded assignment/detail response.
- Labeler role cannot call `GET /audit`, so returned reason text for labeler revision can only be shown if a future labeler-safe contract exposes it.

Blockers:
- Backend/Supervisor decision needed for a versioned template snapshot read contract for submissions and assignments.
- Backend/Supervisor decision needed for review detail AI metadata, human review comments, and previous-attempt diff contracts.
- Backend/Supervisor decision needed if AI decision and score filters must be active server-backed controls on the review queue.

Requests for Supervisor:
- Review Task07 implementation and decide whether the API limitations above should be assigned to Backend Workflow/AI Review agents before QA Docs Deploy starts full E2E coverage.
