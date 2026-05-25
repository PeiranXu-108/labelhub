# Task 08 QA Docs Deploy Handoff - 2026-05-25 Review Fix

## Agent Handoff

Agent: QA Docs Deploy Agent
Task file: docs/tasks/08-qa-docs-deploy-agent.md
Status: ready for review

Changed files:
- README.md
- docs/deployment.md
- docs/handoffs/2026-05-24-task08-qa-docs-deploy-handoff.md
- docs/handoffs/2026-05-25-task08-qa-docs-deploy-handoff.md

Verification run:
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_review_fix.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_review_fix_exports ./.venv313/bin/alembic upgrade head: pass, migrations applied through 20260524_0002 with the same export-storage env documented for local smoke.
- cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_review_fix.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_review_fix_exports ./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000: pass for local backend startup; stopped after E2E.
- cd frontend && env VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1: pass for local frontend startup; stopped after E2E.
- cd frontend && LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_review_fix.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_review_fix_exports BACKEND_URL=http://127.0.0.1:8000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e: pass, 1 Playwright happy-path test passed.

E2E status:
- Local E2E smoke remains passing after documentation changes.
- The documented backend startup now sets `LABELHUB_EXPORT_STORAGE_PATH` to the same path used by the E2E helper command, so synchronous `seed_e2e_data.py run-export` and API download read/write the same export file path.

Deployment status:
- Docker Compose remains config-validated only unless a future reviewer or agent runs `docker compose up --build`.
- README.md and docs/deployment.md now explicitly state that Task08 has not recorded full Docker runtime startup verification.
- Local runtime smoke is verified through SQLite backend startup, Vite frontend startup, and Playwright E2E.

Known limitations:
- Real username/password login is not implemented; `/login` remains a disabled placeholder and demo/E2E use role JWT tokens.
- Live AI review still requires provider credentials; local E2E uses deterministic static structured output through `seed_e2e_data.py`.
- Owner dashboard aggregate counts for submission statuses and AI decisions still need a dedicated backend contract if required.
- Data retention/privacy policy remains undecided before sensitive production datasets.
- Frontend Docker service uses Vite dev server for MVP demonstration, not a hardened static production server.
- Export storage defaults to local filesystem storage and needs a durable volume or object storage adapter for production.

Contract changes:
- none.

Blockers:
- none for local MVP demonstration.

Requests for Supervisor:
- Re-review Task08 against `docs/reviews/2026-05-25-task08-qa-docs-deploy-review.md`.
- Decide whether full Docker runtime startup is required for final signoff; current Task08 evidence intentionally does not claim full Docker runtime validation.
