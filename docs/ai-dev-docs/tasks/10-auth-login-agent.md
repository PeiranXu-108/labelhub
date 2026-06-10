# Task 10: Auth Login Agent

## Mission

Replace the placeholder `/login` route with a real MVP username/password login flow backed by FastAPI JWT authentication.

This task exists because the integrated MVP currently uses manually seeded bearer tokens and a disabled login form. The Auth Login Agent must turn the frozen auth decision into working backend and frontend behavior without expanding scope into registration, password reset, SSO, or production identity management.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/10-auth-login-agent.md`
- `README.md`
- `docs/api.md`
- `docs/demo-script.md`
- `docs/known-limitations.md`
- Current auth/security code in `backend/app/core/security.py` and `backend/app/api/deps.py`
- Current frontend API helper and login placeholder in `frontend/src/features/owner/api.ts`, `frontend/src/App.tsx`, and `frontend/src/routes/LoginPage.tsx`

## Dependencies

- Task 02 backend domain/API is approved.
- Task 06 and Task 07 frontend flows are approved.
- Task 08 QA/docs work is approved, but its docs currently describe `/login` as a placeholder.

## Product Decisions Frozen For This Task

- Auth mode is JWT username/password for MVP.
- There is no self-registration in Task 10.
- There is no password reset, email verification, OAuth, SSO, or refresh-token rotation in Task 10.
- Demo users must be created by an explicit seed script or documented management command, not by automatic login-side provisioning.
- Role comes from persisted backend user state and JWT claims, not from a frontend role switcher.
- Existing localStorage key `labelhub.accessToken` must remain the frontend token storage key unless Supervisor approves a migration.

If the agent believes any of these decisions should change, stop and request Supervisor/user approval before implementation.

## Owned Files

The Auth Login Agent may edit:

- `backend/app/api/routes/auth.py`
- `backend/app/main.py` only to register the auth router
- `backend/app/models/user.py`
- `backend/app/schemas/auth.py`
- `backend/app/schemas/user.py` if needed for `GET /auth/me`
- `backend/app/core/security.py` only for auth helper extensions
- `backend/app/api/deps.py` only for authenticated-user loading and role enforcement cleanup
- `backend/app/services/auth.py` if a service layer is useful
- Alembic migrations for user password authentication
- Backend auth tests under `backend/tests/`
- Demo/seed scripts under `backend/scripts/`
- `frontend/src/routes/LoginPage.tsx`
- `frontend/src/App.tsx` only for route guards, logout, and auth state wiring
- `frontend/src/features/auth/`
- Shared frontend API/auth helper files needed to keep `labelhub.accessToken` centralized
- Frontend tests that cover login, auth guards, logout, or updated token setup
- `frontend/e2e/` only to switch smoke tests from manual token injection to real login where practical
- `frontend/src/api/openapi.json` only by regenerating it from the backend
- `README.md`, `docs/api.md`, `docs/demo-script.md`, `docs/deployment.md`, and `docs/known-limitations.md` to replace placeholder-login instructions with real login instructions
- `docs/handoffs/<date>-task10-auth-login-handoff.md`

The agent must not edit unrelated workflow, template, AI review, export, or reviewer business logic.

## Backend Requirements

Implement:

- `POST /auth/login`
  - Request body: `{ "email": string, "password": string }`
  - Response body must include at least:
    - `access_token`
    - `token_type: "bearer"`
    - authenticated `user` summary with `id`, `email`, `name`, and `role`
  - Use `verify_password` from `backend/app/core/security.py`.
  - Return `401` for invalid credentials without leaking whether the email exists.

- `GET /auth/me`
  - Requires bearer auth.
  - Returns the persisted current user summary.
  - Must not rely only on unverified frontend state.

- User password persistence:
  - Add a `password_hash` column or equivalent persisted credential field.
  - Add an Alembic migration.
  - Existing tests and migrations must still upgrade cleanly.

- Token behavior:
  - Continue using JWTs from `create_access_token`.
  - Include `sub` and `role` claims.
  - Use backend role authorization dependencies for business routes.
  - Role mismatches between token and persisted user should fail closed or refresh from DB in a clearly tested way.

- User provisioning:
  - Add or update a seed script to create deterministic demo users for owner, labeler, and reviewer flows.
  - Recommended demo credentials:
    - `owner@example.com` / `LabelHubOwner123!`
    - `labeler@example.com` / `LabelHubLabeler123!`
    - `reviewer@example.com` / `LabelHubReviewer123!`
  - Do not create users implicitly during normal login.

- Existing token helper compatibility:
  - If `backend/scripts/seed_e2e_data.py tokens` remains, it must seed or require matching users rather than depending on arbitrary token-side user creation.
  - `get_current_actor` must not silently create real application users from arbitrary bearer tokens in normal API usage.

## Frontend Requirements

Implement:

- A live `/login` page using the existing visual stack and Ant Design patterns.
- Email/password form validation.
- Submit to `POST /auth/login`.
- Store the returned token in `localStorage["labelhub.accessToken"]`.
- Redirect after login by backend role:
  - `owner` -> `/owner/tasks`
  - `labeler` -> `/labeler/tasks`
  - `reviewer` -> `/review/queue`
- Show invalid-credential and network errors without exposing raw stack traces.
- Add route protection so role-specific routes require an authenticated user.
- Add a logout action in the app shell that clears `labelhub.accessToken` and returns to `/login`.
- Keep owner, labeler, reviewer, and export API clients using the same centralized token helper.
- Do not add a frontend-only role switcher for real auth mode.

## Documentation Requirements

Update docs that currently call login a placeholder:

- `README.md`
- `docs/api.md`
- `docs/demo-script.md`
- `docs/deployment.md`
- `docs/known-limitations.md`

Docs must include:

- How to seed demo users.
- The demo credentials or a clear pointer to the seed script output.
- How to start backend/frontend for the login flow.
- Which auth features remain out of scope.
- That business routes still enforce role permissions server-side.

## Required Tests

Backend:

- Successful login returns bearer token and user summary.
- Invalid email/password returns `401`.
- `GET /auth/me` succeeds with a valid token.
- `GET /auth/me` fails for missing/invalid token.
- Role-protected business route behavior still works.
- Migrations upgrade cleanly.
- Existing backend test suite passes.

Frontend:

- Login form submits credentials and stores `labelhub.accessToken`.
- Successful owner/labeler/reviewer logins redirect to the correct route.
- Invalid credentials show an error.
- Protected route without token redirects to `/login` or blocks access consistently.
- Logout clears the token.
- Existing owner, labeler, reviewer, and export tests still pass.

E2E:

- Prefer real login over direct localStorage token injection for the happy path.
- If direct token injection remains for a helper-only path, document why and keep it isolated to tests.

## Verification Commands

Run at minimum:

```bash
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task10.json
cd frontend && npm test -- --run
cd frontend && npm run build
docker compose config >/tmp/labelhub-compose-task10.yaml
git diff --check
```

If the repository has a working E2E command after Task08, run the relevant login-enabled smoke test and report the exact command/result.

## Handoff Requirements

Create `docs/handoffs/<date>-task10-auth-login-handoff.md` with the standard `## Agent Handoff` block from `docs/agent-coordination.md`.

The handoff must also include:

- Final auth routes and request/response shapes.
- Migration name.
- Demo user seed command and credentials handling.
- Whether arbitrary bearer-token user auto-creation was removed, limited, or retained, with justification.
- OpenAPI regeneration result.
- Frontend route guard and redirect behavior.
- Docs updated.
- Tests/builds/E2E commands run and results.
- Any remaining auth limitations.

## Supervisor Review Checklist

The Supervisor will verify:

- Auth implementation stayed inside the owned files above.
- No unrelated workflow/template/AI/export behavior was changed.
- `WorkflowService` still owns workflow state transitions.
- Published template schemas remain immutable.
- AI review remains structured and auditable.
- Backend role authorization is enforced server-side.
- Demo users are provisioned explicitly, not guessed during login.
- `/auth/login` and `/auth/me` are present in generated OpenAPI.
- Frontend uses the backend role from auth response/current user, not a client-only role switch.
- Placeholder-login docs were updated honestly.
- Relevant tests/builds were run and reported.
