# Task 08 QA Docs Deploy Handoff - 2026-05-24

## Agent Handoff

Agent: QA Docs Deploy Agent
Task file: docs/tasks/08-qa-docs-deploy-agent.md
Status: ready for review

Changed files:
- README.md
- backend/Dockerfile
- backend/app/core/config.py
- backend/scripts/seed_e2e_data.py
- docker-compose.yml
- docs/api.md
- docs/architecture.md
- docs/demo-script.md
- docs/deployment.md
- docs/known-limitations.md
- docs/handoffs/2026-05-24-task08-qa-docs-deploy-handoff.md
- frontend/Dockerfile
- frontend/e2e/labelhub-happy-path.spec.ts
- frontend/package-lock.json
- frontend/package.json
- frontend/playwright.config.ts
- frontend/vite.config.ts

Verification run:
- cd backend && ./.venv313/bin/pytest -q: pass, 40 tests passed, 1 existing Pydantic alias warning from schema generation.
- cd frontend && npm test -- --run: pass, 7 files and 22 tests passed, with existing React Router future-flag warnings.
- cd frontend && npm run build: pass, with existing Vite chunk-size warning for the main bundle.
- docker compose config: pass; config includes api, frontend, worker, postgres, and redis services.
- python -m json.tool frontend/src/api/openapi.json >/private/tmp/labelhub_task08_openapi_check.json: pass.
- git diff --check: pass.
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_e2e_rerun.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_exports_rerun ./.venv313/bin/alembic upgrade head: pass, applied migrations through 20260524_0002.
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_e2e_rerun.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_exports_rerun ./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000: pass for local E2E server startup; stopped after test.
- cd frontend && env VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1: pass for local E2E server startup; stopped after test.
- cd frontend && LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_e2e_rerun.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_exports_rerun BACKEND_URL=http://127.0.0.1:8000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e: pass, 1 Playwright happy-path test passed.
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_review_fix.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_review_fix_exports ./.venv313/bin/alembic upgrade head: pass, applied migrations through 20260524_0002 with the same export-storage environment now documented for local smoke.
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_review_fix.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_review_fix_exports ./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000: pass for review-fix local E2E server startup; stopped after test.
- cd frontend && env VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1: pass for review-fix local E2E server startup; stopped after test.
- cd frontend && LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_review_fix.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_review_fix_exports BACKEND_URL=http://127.0.0.1:8000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e: pass, 1 Playwright happy-path test passed after README.md and docs/deployment.md were corrected.

E2E status:
- Added `backend/scripts/seed_e2e_data.py` for deterministic role tokens, static passing AI review, and synchronous export execution in local smoke tests.
- Added `frontend/playwright.config.ts` and `frontend/e2e/labelhub-happy-path.spec.ts`.
- The Playwright happy path covers owner task/item/template/review-config/publish, labeler marketplace claim and submission, deterministic structured AI review, reviewer queue filters/detail/approval, owner JSONL export and download, plus frontend owner/labeler/reviewer route rendering against the running API.
- The E2E uses local Chrome via Playwright `channel: "chrome"` to avoid requiring a bundled browser download.

Deployment status:
- Docker Compose validates with `docker compose config`.
- API image now copies Alembic files, and the API service runs `alembic upgrade head` before Uvicorn.
- Compose now includes a Celery `worker` service for AI review/export jobs.
- Frontend image now copies `package-lock.json` and Compose sets `VITE_API_BASE_URL=http://localhost:8000`.
- Full `docker compose up --build` was not run in this pass; Docker deployment validation is config-level only. Local runtime smoke was verified with SQLite backend/frontend startup plus Playwright E2E.

Contract changes:
- Backend default CORS origins now include both `http://localhost:5173` and `http://127.0.0.1:5173` for local E2E/demo flows.
- No API payload shape, workflow state, OpenAPI route, or enum contract was changed.
- Frontend Vitest excludes `frontend/e2e/**` so Playwright specs are not collected as unit tests.

Known limitations:
- Real username/password login is not implemented; `/login` remains a disabled placeholder and demo/E2E use role JWT tokens.
- Live AI review still requires provider credentials; local E2E uses deterministic static structured output through `seed_e2e_data.py`.
- Owner dashboard aggregate counts for submission statuses and AI decisions still need a dedicated backend contract if required.
- Data retention/privacy policy remains undecided before sensitive production datasets.
- Frontend Docker service uses Vite dev server for MVP demonstration, not a hardened static production server.
- Export storage defaults to local filesystem storage and needs a durable volume or object storage adapter for production.

Blockers:
- none for local MVP demonstration.

Requests for Supervisor:
- Review and approve Task08.
- Decide whether full Docker runtime startup (`docker compose up --build`) is required before final project signoff, because this pass validated Compose config and local startup/E2E but did not build and run the complete Docker stack.
