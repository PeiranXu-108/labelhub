# Task 10 Auth Login Review

## Supervisor Feedback

Agent: Auth Login Agent
Decision: needs changes

What is good:
- Backend auth routes match the Task10 contract: `POST /auth/login` returns a bearer token plus user summary, and `GET /auth/me` returns the persisted current user.
- Normal bearer auth now fails closed for missing users and token-role mismatches instead of silently creating application users.
- Frontend login is live, uses the preserved `labelhub.accessToken` key, redirects by backend role, protects role routes, and exposes logout.
- OpenAPI, demo docs, known limitations, backend tests, frontend tests, build, migration, and login-specific Playwright smoke are aligned.

Required changes:
- Remove or explicitly account for non-Task10 workspace artifacts. The working tree contains untracked `.understand-anything/` files, and `.gitignore` has unrelated `./underlying` and `./codegraph` additions that are not listed in the Task10 handoff and are not part of the Auth Login Agent ownership. Preferred fix: remove the `.gitignore` change and delete the generated `.understand-anything/` directory from the worktree. If any of these files are intentional, add them to the handoff with a Supervisor-approved justification.
- After cleanup, update `docs/handoffs/2026-05-28-task10-auth-login-handoff.md` if the remaining changed-file list differs from the actual worktree. Keep the documented full happy-path E2E Redis/Docker limitation if it still applies.

Verification:
- `cd backend && ./.venv313/bin/pytest -q`: pass, 46 tests, 1 existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass.
- `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task10-supervisor.json`: pass.
- `cd frontend && npm test -- --run`: pass, 7 files and 25 tests, with existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `docker compose config >/tmp/labelhub-compose-task10-supervisor.yaml`: pass.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_supervisor.sqlite ./.venv313/bin/alembic upgrade head`: pass through `20260528_0003`.
- `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_supervisor_e2e.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task10_supervisor_e2e_exports BACKEND_URL=http://127.0.0.1:18010 FRONTEND_URL=http://127.0.0.1:5173 npx playwright test e2e/auth-login.spec.ts --project=chromium`: pass, 1 Chromium login smoke.
- `git diff --check`: pass.

Status board update:
- Task10 marked as reviewed with `needs changes`; approval is blocked only on cleanup/handoff accuracy, not on the core auth implementation.

Next step:
- Auth Login Agent should clean the unrelated worktree artifacts or document them with Supervisor approval, then request re-review.
