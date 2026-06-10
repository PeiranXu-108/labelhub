# Task 20: Final Readiness Fixes Agent

## Mission

Close the concrete final-integration blockers found by the Supervisor review on 2026-05-31 so LabelHub can be re-reviewed for MVP readiness.

This task is intentionally narrow. It does not own new product features, production policy decisions, or broad refactors. It owns making the documented local and Docker smoke paths truthful, repeatable, and green.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/reviews/2026-05-31-final-integration-readiness-review.md`
- `docs/tasks/20-final-readiness-fixes-agent.md`
- `README.md`
- `docs/deployment.md`
- `docs/demo-script.md`
- `docs/known-limitations.md`
- `frontend/e2e/auth-login.spec.ts`
- `frontend/e2e/labelhub-happy-path.spec.ts`
- `frontend/src/routes/LoginPage.tsx`
- `backend/scripts/seed_e2e_data.py`
- `backend/app/api/routes/exports.py`
- `backend/app/workers/exports.py`
- Current export API/service/worker tests

## Dependencies

- Tasks 01-19 are approved or approved with documented blockers.
- Supervisor final integration review returned `not ready` because E2E/export smoke blockers remain.

## Owned Areas

- Playwright smoke tests under `frontend/e2e/`.
- Local E2E helper script `backend/scripts/seed_e2e_data.py`.
- Export enqueue/error handling in `backend/app/api/routes/exports.py` and `backend/app/workers/exports.py`.
- Export tests under `backend/tests/`.
- Frontend test setup only if needed for stable selectors.
- Documentation that describes local/Docker E2E, export worker requirements, and known limitations:
  - `README.md`
  - `docs/deployment.md`
  - `docs/demo-script.md`
  - `docs/known-limitations.md`
- Generated `frontend/src/api/openapi.json` only if API contracts change.
- `docs/handoffs/<date>-task20-final-readiness-fixes-handoff.md`

## Non-Owned Areas

- Workflow state semantics and `WorkflowService` transitions.
- Assignment claim, draft, submit, review-stage, or AI-review decision semantics.
- Template schema/runtime semantics.
- Live AI provider secrets or production retention/security policy decisions.
- Production hardening beyond making the existing readiness checks honest.

## Required Fixes

### E2E Login Selectors

The current login form is localized with labels `邮箱`, `密码`, and button text `登录`, while Playwright still looks for `Email`, `Password`, and `Sign in`. Fix the tests or add stable accessible names/test IDs so the smoke suite follows the actual UI.

Do not make the UI bilingual just to satisfy the test unless the product text already requires that. Prefer resilient selectors that still verify the user-facing form exists.

### E2E Seed Idempotency and Parallel Safety

`npm run e2e` currently runs two specs in parallel. Both specs call demo-user seeding against the same database and can race into `UNIQUE constraint failed: users.email`.

Make the seed path idempotent under repeated and parallel E2E calls. Acceptable approaches:

- make `seed_demo_users()` perform an upsert/merge that cannot insert duplicate demo emails during a parallel race, or
- make Playwright run serially for this suite and document why, or
- isolate each spec with a unique database path and environment.

Prefer fixing `seed_demo_users()` because it also improves demo/operator ergonomics.

### Export Enqueue Failure Handling

The local documented SQLite smoke path can run without Redis. In that mode, `POST /tasks/{task_id}/exports` currently creates the job and then returns `500` if `enqueue_export_job()` cannot reach Redis.

Make export creation behave predictably:

- With Redis/worker available, keep async enqueue semantics.
- Without Redis, do not crash the request after creating the job.
- Return a stable API response with enough state for the documented synchronous helper `scripts/seed_e2e_data.py run-export <export_job_id>` to complete the demo.
- Persist an audit/log signal or job error state only if it does not break the existing API contract. Do not silently mark a job succeeded.

The minimum acceptable MVP behavior is: export job creation returns `202`/job `pending`, enqueue failure is logged, and local E2E can call the synchronous helper to produce and download the file.

### E2E Coverage

After fixes, `cd frontend && npm run e2e` must pass against the documented local SQLite backend/frontend smoke setup.

If Docker-mode E2E is still intentionally unsupported, keep it documented as a separate limitation. If this task makes Docker-mode E2E pass, update docs and status evidence accordingly.

## Implementation Steps

- [ ] Add or update backend tests proving repeated `seed_demo_users()` calls are idempotent.
- [ ] Add a concurrency-safe guard/upsert for demo users.
- [ ] Add backend tests proving export creation returns a job even when enqueueing raises a broker error.
- [ ] Update export enqueue handling to log controlled failures without returning `500` from the create-export endpoint.
- [ ] Update Playwright selectors for the current login UI.
- [ ] Run local backend/frontend smoke and full Playwright E2E.
- [ ] Update README/deployment/demo/known-limitations to match the exact E2E and export-worker behavior.
- [ ] Regenerate OpenAPI only if an API schema changes.
- [ ] Create the standard handoff.

## Required Tests

- Repeated `backend/scripts/seed_e2e_data.py demo-users` succeeds against the same database.
- Repeated or parallel `backend/scripts/seed_e2e_data.py tokens` does not fail on duplicate demo emails.
- Export job creation returns a job when Celery/Redis publish fails.
- Existing async export worker tests still pass.
- `frontend/e2e/auth-login.spec.ts` passes against the current localized login UI.
- `frontend/e2e/labelhub-happy-path.spec.ts` passes against the documented local SQLite smoke setup.
- Full `npm run e2e` passes locally.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_auth_api.py tests/test_exports.py tests/test_export_worker.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python3 -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run
cd frontend && npm run build

# Local E2E setup; adjust ports only if occupied.
rm -f /private/tmp/labelhub_task20_e2e.sqlite
rm -rf /private/tmp/labelhub_task20_e2e_exports /private/tmp/labelhub_task20_e2e_uploads
mkdir -p /private/tmp/labelhub_task20_e2e_exports /private/tmp/labelhub_task20_e2e_uploads
cd backend && env \
  LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task20_e2e.sqlite \
  LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task20_e2e_exports \
  LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_task20_e2e_uploads \
  ./.venv313/bin/alembic upgrade head
cd backend && env \
  LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task20_e2e.sqlite \
  LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task20_e2e_exports \
  LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_task20_e2e_uploads \
  LABELHUB_REDIS_URL=redis://127.0.0.1:6399/0 \
  LABELHUB_CORS_ORIGINS='["http://127.0.0.1:5174","http://localhost:5174"]' \
  ./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 18010
cd frontend && env VITE_API_BASE_URL=http://127.0.0.1:18010 npm run dev -- --host 127.0.0.1 --port 5174
cd frontend && env \
  LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task20_e2e.sqlite \
  LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task20_e2e_exports \
  LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_task20_e2e_uploads \
  BACKEND_URL=http://127.0.0.1:18010 \
  FRONTEND_URL=http://127.0.0.1:5174 \
  npm run e2e

env LABELHUB_LLM_API_KEY= docker compose config --quiet
git diff --check
```

When starting backend/frontend servers for E2E, stop them before ending the handoff.

## Handoff Requirements

Create `docs/handoffs/<date>-task20-final-readiness-fixes-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- final E2E selector strategy
- seed idempotency/concurrency behavior
- export enqueue failure policy
- whether local E2E passes with Redis absent
- whether Docker-mode E2E is fixed or still documented as a limitation
- backend/frontend tests, build, OpenAPI, Compose config, and E2E results
- any remaining readiness blockers for Supervisor re-review
