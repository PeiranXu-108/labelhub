# Task 10 Auth Login Handoff

## Agent Handoff

Agent: Auth Login Agent
Task file: docs/tasks/10-auth-login-agent.md
Status: ready for review

Changed files:
- README.md
- backend/alembic/versions/20260528_0003_user_password_auth.py
- backend/app/api/deps.py
- backend/app/api/routes/auth.py
- backend/app/core/security.py
- backend/app/main.py
- backend/app/models/__init__.py
- backend/app/schemas/auth.py
- backend/app/schemas/user.py
- backend/app/services/auth.py
- backend/scripts/seed_e2e_data.py
- backend/tests/conftest.py
- backend/tests/test_auth_api.py
- backend/tests/test_review_integration_contracts.py
- docs/api.md
- docs/demo-script.md
- docs/deployment.md
- docs/known-limitations.md
- docs/handoffs/2026-05-28-task10-auth-login-handoff.md
- frontend/e2e/auth-login.spec.ts
- frontend/e2e/labelhub-happy-path.spec.ts
- frontend/src/App.tsx
- frontend/src/__tests__/App.test.tsx
- frontend/src/api/openapi.json
- frontend/src/features/auth/api.ts
- frontend/src/features/auth/http.ts
- frontend/src/features/auth/token.ts
- frontend/src/features/auth/types.ts
- frontend/src/features/labeler/api.ts
- frontend/src/features/owner/api.ts
- frontend/src/features/reviewer/api.ts
- frontend/src/routes/LoginPage.tsx
- frontend/src/styles.css

Verification run:
- `cd backend && ./.venv313/bin/pytest -q`: pass, 46 passed, 1 existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task10.json`: pass.
- `cd frontend && npm test -- --run`: pass, 7 files and 25 tests passed, with existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `docker compose config >/tmp/labelhub-compose-task10.yaml`: pass.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_migration.sqlite ./.venv313/bin/alembic upgrade head`: pass through revision `20260528_0003`.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_migration.sqlite ./.venv313/bin/python scripts/seed_e2e_data.py demo-users`: pass, created owner/labeler/reviewer demo users.
- `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_e2e.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task10_e2e_exports BACKEND_URL=http://127.0.0.1:18010 FRONTEND_URL=http://127.0.0.1:5173 npx playwright test e2e/auth-login.spec.ts`: pass, 1 Chromium login smoke passed.
- `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_e2e.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task10_e2e_exports BACKEND_URL=http://127.0.0.1:18010 FRONTEND_URL=http://127.0.0.1:5174 npm run e2e`: failed at export creation because Celery attempted Redis at `localhost:6379` and no Redis server was running.
- `docker compose up -d redis`: not run successfully; Docker daemon was unavailable at `/Users/xupeiran/.docker/run/docker.sock`.
- `git diff --check`: pass.
- Review follow-up cleanup: `.gitignore` has no remaining diff; generated `.understand-anything/` and `frontend/test-results/` artifacts were removed from the worktree.

Contract changes:
- Added `POST /auth/login`.
- Added `GET /auth/me`.
- Added nullable `users.password_hash` persistence for explicitly seeded/login-capable users.
- Normal bearer auth now requires the token subject to match a persisted user and the token role to match the persisted user role.

Blockers:
- Full Task08 happy-path E2E could not complete in this local environment because Redis/Docker was unavailable for export-job enqueue. The Task10 login-specific Playwright smoke passed.

Requests for Supervisor:
- Review the model-file ownership nuance: this repo currently maps `User` in `backend/app/models/__init__.py`, so Task10 added `password_hash` there instead of creating a duplicate `backend/app/models/user.py`.
- Re-run the full happy-path E2E in an environment with Redis or Docker available if Supervisor requires export enqueue coverage for Task10 approval.

Non-Task10 workspace context not listed as Auth Login changed files:
- `docs/agent-coordination.md`
- `docs/agent-prompts.md`
- `docs/status-board.md`
- `docs/tasks/10-auth-login-agent.md`
- `docs/reviews/2026-05-29-task10-auth-login-review.md`

These files are Supervisor/task/review context in the current working tree rather than Auth Login implementation ownership. The unrelated `.gitignore` diff and generated `.understand-anything/` directory called out in review were removed.

## Auth Routes

- `POST /auth/login`
  - Request: `{ "email": string, "password": string }`
  - Success response: `{ "access_token": string, "token_type": "bearer", "user": { "id": string, "email": string, "name": string, "role": "owner" | "labeler" | "reviewer" | "ai_agent" } }`
  - Invalid credentials: `401` with `INVALID_CREDENTIALS`; response does not distinguish missing email from wrong password.
- `GET /auth/me`
  - Requires `Authorization: Bearer <token>`.
  - Success response: persisted current user summary `{ id, email, name, role }`.
  - Missing, malformed, unknown-subject, or role-mismatched tokens return `401`.

## Migration

- Migration name: `20260528_0003_user_password_auth`
- Revision: `20260528_0003`
- Change: adds `users.password_hash`.

## Demo Users

Seed command:

```bash
cd backend && ./.venv313/bin/python scripts/seed_e2e_data.py demo-users
```

Credentials:
- Owner: `owner@example.com` / `LabelHubOwner123!`
- Labeler: `labeler@example.com` / `LabelHubLabeler123!`
- Reviewer: `reviewer@example.com` / `LabelHubReviewer123!`

The legacy `scripts/seed_e2e_data.py tokens` command is retained for API/E2E helpers, but it now seeds matching persisted users before issuing JWTs.

## Bearer Token Auto-Creation

Arbitrary bearer-token user auto-creation was removed from normal API authentication. `get_current_actor` now loads the persisted user via `get_current_user`; unknown subjects fail closed with `401`, and token-role/persisted-role mismatches fail closed with `401`.

## Frontend Auth Behavior

- `/login` is a live Ant Design email/password form.
- Successful login stores the bearer token in `localStorage["labelhub.accessToken"]`.
- Successful login redirects by backend role:
  - `owner` -> `/owner/tasks`
  - `labeler` -> `/labeler/tasks`
  - `reviewer` -> `/review/queue`
- Protected owner, labeler, and reviewer routes require an authenticated `/auth/me` user with the matching role.
- Mismatched authenticated roles redirect to their own role home.
- Logout clears `labelhub.accessToken` and returns to `/login`.
- Owner, labeler, reviewer, and export API clients now share the centralized auth/token helper.

## Docs Updated

- README.md
- docs/api.md
- docs/demo-script.md
- docs/deployment.md
- docs/known-limitations.md

## OpenAPI

OpenAPI was regenerated with `backend/scripts/export_openapi.py`. The generated `frontend/src/api/openapi.json` includes `/auth/login`, `/auth/me`, `LoginRequest`, `LoginResponse`, and `UserSummary`.

## Remaining Auth Limitations

- No self-registration.
- No password reset or email verification.
- No OAuth, SSO, refresh-token rotation, or production identity lifecycle policy.
- Demo credentials are deterministic and must be replaced before non-demo use.
- Password hashing now defaults to Passlib `pbkdf2_sha256` while still allowing bcrypt verification for compatibility; this avoids the local Python/bcrypt backend failure seen during the first auth test run.
