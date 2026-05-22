# Task 02 Backend Domain API Review - 2026-05-23

## Supervisor Feedback

Agent: Backend Domain API Agent
Decision: needs changes

What is good:
- Handoff is complete and discoverable at `docs/handoffs/2026-05-23-task02-backend-domain-api-handoff.md`.
- Work mostly stayed inside Task 02 ownership: backend models, schemas, services, task/labeler/review/audit routes, Alembic migration, backend tests, and generated OpenAPI snapshot.
- Submission status transitions are centralized through `WorkflowService.transition_submission(...)`.
- Core workflow tests, API tests, full backend test suite, Alembic upgrade, and OpenAPI JSON validation pass.
- AI review output remains structured by contract; no free-form AI parsing was introduced.

Required changes:
- Move task status transitions into `WorkflowService` as well. `TaskService.transition_task(...)` currently mutates `task.status` directly in `backend/app/services/tasks.py`, which violates the frozen coordination rule that workflow state changes go through `WorkflowService`. Add a `WorkflowService.transition_task(...)` path, route publish/pause/end through it, and keep the task audit log in the same transaction.
- Add or update tests proving task publish/pause/end status transitions use the shared workflow service and still reject invalid transitions.
- Resolve the default-template-on-task-publish bridge before approval. Either remove the implicit `TemplateSchema` creation from task publish and let claim fail with `TEMPLATE_REQUIRED` until Task 03 owns template publishing, or get explicit user approval for this temporary bridge and document it as an integration risk for Template Agent.
- Make `tasks.created_by` non-null in the SQLAlchemy model and migration, or provide a concrete blocker. The API already has an authenticated actor and the domain contract lists `created_by`; keeping it nullable weakens traceability.

Verification:
- `cd backend && ./.venv313/bin/pytest tests/test_workflow.py tests/test_tasks_api.py tests/test_labeler_api.py tests/test_review_api.py`: pass, 8 tests passed.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 10 tests passed.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task02_review_20260523.sqlite ./.venv313/bin/alembic upgrade head`: pass.
- `python -m json.tool frontend/src/api/openapi.json`: pass.
- `git status --short`: available; Task 02 changes are visible as modified/new files.

Status board update:
- Task 02 marked `needs changes`.
- Backend Workflow Agent marked `needs changes`.
- Downstream Template, AI Review, Worker Export, and frontend agents remain blocked until Task 02 is approved.

Next step:
- Return Task 02 to the Backend Workflow Agent. After fixes, the agent should rerun the targeted backend tests, full backend tests, Alembic upgrade, and OpenAPI JSON validation, then resubmit the handoff.
