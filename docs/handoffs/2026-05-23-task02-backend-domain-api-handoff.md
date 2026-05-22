# Task 02 Backend Domain API Handoff - 2026-05-23

## Agent Handoff

Agent: Backend Domain API Agent
Task file: docs/tasks/02-backend-domain-api-agent.md
Status: ready for review

Changed files:
- backend/alembic.ini
- backend/alembic/env.py
- backend/alembic/script.py.mako
- backend/alembic/versions/20260523_0001_core_domain.py
- backend/app/api/deps.py
- backend/app/api/routes/audit.py
- backend/app/api/routes/labeler.py
- backend/app/api/routes/review.py
- backend/app/api/routes/tasks.py
- backend/app/db/base.py
- backend/app/domain/enums.py
- backend/app/main.py
- backend/app/models/__init__.py
- backend/app/schemas/__init__.py
- backend/app/schemas/audit.py
- backend/app/schemas/labeler.py
- backend/app/schemas/review.py
- backend/app/schemas/submission.py
- backend/app/schemas/task.py
- backend/app/services/submissions.py
- backend/app/services/tasks.py
- backend/app/services/workflow.py
- backend/scripts/export_openapi.py
- backend/tests/conftest.py
- backend/tests/test_labeler_api.py
- backend/tests/test_review_api.py
- backend/tests/test_tasks_api.py
- backend/tests/test_workflow.py
- frontend/src/api/openapi.json
- docs/handoffs/2026-05-23-task02-backend-domain-api-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_workflow.py tests/test_tasks_api.py tests/test_labeler_api.py tests/test_review_api.py: pass, 13 tests passed
- cd backend && ./.venv313/bin/pytest -q: pass, 15 tests passed
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task02_review_fix_20260523.sqlite ./.venv313/bin/alembic upgrade head: pass
- python -m json.tool frontend/src/api/openapi.json: pass

Migration names:
- 20260523_0001_core_domain.py

Final API route list:
- GET /health
- GET /tasks
- POST /tasks
- GET /tasks/{task_id}
- PATCH /tasks/{task_id}
- POST /tasks/{task_id}/publish
- POST /tasks/{task_id}/pause
- POST /tasks/{task_id}/end
- POST /tasks/{task_id}/items/import
- GET /tasks/{task_id}/items
- GET /tasks/{task_id}/review-config
- PUT /tasks/{task_id}/review-config
- GET /labeler/tasks
- POST /labeler/tasks/{task_id}/claim
- GET /labeler/assignments/{assignment_id}
- PUT /labeler/assignments/{assignment_id}/draft
- POST /labeler/assignments/{assignment_id}/submit
- GET /labeler/submissions
- GET /review/queue
- GET /review/submissions/{submission_id}
- POST /review/submissions/{submission_id}/approve
- POST /review/submissions/{submission_id}/return
- POST /review/submissions/batch
- GET /audit

Workflow matrix test results:
- Submission invalid transition rejected: pass
- Submission status transition writes audit log in the same SQLAlchemy transaction: pass
- Task publish transition through `WorkflowService.transition_task(...)` writes audit log in the same SQLAlchemy transaction: pass
- Task invalid transition rejected: pass
- Labeler cannot approve submissions: pass
- Return action requires a reason: pass
- Claiming item requires published task, published template, and respects assignment ownership: pass

Contract changes:
- Added JWT bearer role dependency. Tokens must include `sub` and `role`; accepted roles remain `owner`, `labeler`, `reviewer`, `ai_agent`.
- Added core models and OpenAPI schemas for tasks, task items, assignments, submissions, review configs, and audit logs.
- Added `SubmissionAction` and `TaskAction` enum contracts in `backend/app/domain/enums.py`.
- Refreshed `frontend/src/api/openapi.json`; frontend agents should consume these generated contracts.
- Task publish no longer creates an implicit default template schema. Labeler claim now returns `TEMPLATE_REQUIRED` until Task 03 publishes a schema.
- `tasks.created_by` is now non-null in the SQLAlchemy model, migration, and `TaskRead` schema.
- Task publish/pause/end status changes now route through `WorkflowService.transition_task(...)`; `TaskService` no longer mutates task workflow status.

Blockers:
- Template schema authoring endpoints are still owned by Template Agent.
- Labeler claim/submit happy path requires a published `TemplateSchema`; tests seed this directly until Task 03 adds template publish APIs.
- AI review worker must use `WorkflowService.transition_submission(...)`; no direct submission status writes.
- Export endpoints/workers remain Worker Export Agent scope.

Requests for Supervisor:
- Re-review Task 02 after the required changes from `docs/reviews/2026-05-23-task02-backend-domain-api-review.md`.
- Confirm Template Agent should add explicit template draft/publish APIs before frontend labeler happy-path integration.
