## Agent Handoff

Agent: Final Readiness Fixes Agent
Task file: docs/tasks/20-final-readiness-fixes-agent.md
Status: ready for review

Changed files:
- backend/app/api/routes/exports.py
- backend/scripts/seed_e2e_data.py
- backend/tests/test_auth_api.py
- backend/tests/test_exports.py
- frontend/e2e/auth-login.spec.ts
- frontend/e2e/labelhub-happy-path.spec.ts
- README.md
- docs/deployment.md
- docs/demo-script.md
- docs/known-limitations.md
- docs/handoffs/2026-05-31-task20-final-readiness-fixes-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_auth_api.py tests/test_exports.py tests/test_export_worker.py -q: pass, 15 tests, existing passlib warning.
- cd backend && ./.venv313/bin/pytest -q: pass, 121 tests, existing passlib/Pydantic warnings.
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass, regenerated frontend/src/api/openapi.json with no contract change intended.
- python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task20-openapi.json: pass.
- repeated demo seed/token helper check against /private/tmp/labelhub_task20_seed.sqlite: pass for demo-users twice and tokens twice.
- cd frontend && npm test -- --run: pass, 10 files and 75 tests, existing React Router future-flag warnings.
- cd frontend && npm run build: pass, existing Vite chunk-size warning.
- local SQLite smoke setup with LABELHUB_REDIS_URL=redis://127.0.0.1:6399/0, backend on 127.0.0.1:18010, frontend on 127.0.0.1:5174, then cd frontend && npm run e2e: pass, 2 tests.
- env LABELHUB_LLM_API_KEY= docker compose config --quiet: pass.

Contract changes:
- none. Export create still returns ExportJobRead with 202; enqueue failure now leaves the created job pending instead of surfacing a 500.

Final E2E selector strategy:
- Browser login smoke uses the current localized accessible names: `邮箱`, `密码`, `/登\s*录/`, `退出登录`, and Chinese role headings.
- The full happy-path spec keeps the lifecycle API/helper driven; localized browser route coverage lives in auth-login.spec.ts.

Seed idempotency/concurrency behavior:
- `seed_demo_users()` now seeds each demo user independently, commits per user, and retries once after an `IntegrityError` by reloading the row by deterministic id/email.
- Regression coverage forces parallel first inserts and verifies repeated `build_tokens()` calls leave exactly the three demo users.

Export enqueue failure policy:
- If Celery/Redis publish succeeds, async worker behavior is unchanged.
- If publish raises, the API logs the exception, returns 202 with the created `pending` job, and leaves synchronous helper/worker retry paths able to run the export. It does not mark the job succeeded.

Local E2E result with Redis absent:
- Pass. Verified with Redis pointed at unused 127.0.0.1:6399 and no Redis process required for the local smoke path.

Docker-mode E2E status:
- Not fixed and not claimed. It remains documented as a limitation because the deterministic local helper flow is separate from live Docker worker behavior.

Backend/frontend tests/build/OpenAPI/Compose results:
- Backend targeted and full pytest passed.
- OpenAPI export and JSON validation passed.
- Frontend Vitest and production build passed.
- Compose config quiet validation passed.

Remaining readiness blockers:
- Docker-mode Playwright E2E remains open.
- Live AI provider calls remain unverified without safe credentials.
- Existing production hardening limitations from Task19 still apply: Vite dev server in Compose, root Celery worker, local filesystem storage without retention/backup/scanning policy, and MVP auth without production account lifecycle.

Blockers:
- none for local SQLite final-readiness smoke.

Requests for Supervisor:
- Re-review Task20 changes and rerun the local smoke path if desired.
