# Final Integration Readiness Review

Date: 2026-05-31

Supervisor verdict: `not ready`

## Critical Blockers

- Full local Playwright E2E failed. `frontend/e2e/auth-login.spec.ts` waits for English labels (`Email`, `Password`, `Sign in`) while the current login form in `frontend/src/routes/LoginPage.tsx` exposes localized labels (`邮箱`, `密码`, `登录`).
- Full local Playwright E2E also exposed a parallel seed race: both specs seed the same demo-user emails into the same SQLite database, and `backend/scripts/seed_e2e_data.py tokens` can fail with `UNIQUE constraint failed: users.email`.
- The focused happy-path E2E reached owner create/import/template/publish, labeler claim/submit, deterministic AI review, and reviewer approve, then failed at export creation. `POST /tasks/{task_id}/exports` returned `500` when Redis was unavailable because `enqueue_export_job()` broker errors propagate out of the API route.

## Verification Evidence

- `cd backend && ./.venv313/bin/pytest -q`: pass, 119 tests, existing passlib/Pydantic warnings.
- `cd frontend && npm test -- --run`: pass, 75 tests, existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, existing Vite chunk-size warning.
- `python3 -m json.tool frontend/src/api/openapi.json`: pass.
- `env LABELHUB_LLM_API_KEY= docker compose config --quiet`: pass.
- `env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh`: pass for non-runtime checks; runtime smoke intentionally skipped without `--runtime`.
- `cd frontend && npm run e2e` against documented local backend/frontend setup: fail.
- `cd frontend && npx playwright test e2e/labelhub-happy-path.spec.ts --workers=1`: fail at export creation with `500 Internal Server Error` when Redis broker is unavailable.

## Non-Critical Limitations

- Live AI provider calls were not verified because no safe `LABELHUB_LLM_API_KEY` was provided.
- Docker-mode E2E remains documented as not green.
- Production hardening remains open: Vite dev server in Compose, root Celery worker, local filesystem storage without retention/backup/scanning policy, and MVP auth without production account lifecycle.

## Recommended Follow-Up

Dispatch Task20 Final Readiness Fixes Agent to make local E2E green, fix demo seed idempotency, handle export enqueue failures predictably, and update docs to match the verified smoke paths.
