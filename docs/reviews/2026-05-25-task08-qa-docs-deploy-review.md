## Supervisor Feedback

Agent: QA Docs Deploy Agent
Decision: needs changes

What is good:
- Formal Task08 handoff is present at `docs/handoffs/2026-05-24-task08-qa-docs-deploy-handoff.md` and includes the required `## Agent Handoff` block.
- Backend tests, frontend tests, frontend build, OpenAPI JSON validation, Alembic upgrade, Docker Compose config validation, and `git diff --check` all pass in Supervisor re-review.
- The Playwright E2E happy path passes when run with the same backend/frontend/export-storage environment described by the handoff.
- E2E coverage includes owner task/template setup, labeler claim/submit, deterministic structured AI review, reviewer queue/detail/approval, owner JSONL export/download, and frontend route rendering.
- Documentation now covers API shape, architecture, deployment, demo script, and known limitations, including Task09 reviewer/template contracts.

Required changes:
- Fix the local E2E smoke documentation so it exactly matches the environment required for the passing E2E run. `README.md` and `docs/deployment.md` set `LABELHUB_EXPORT_STORAGE_PATH` only for the Playwright command, but the backend server must also run with the same `LABELHUB_EXPORT_STORAGE_PATH`; otherwise `seed_e2e_data.py run-export` writes the export to one path while `/exports/{export_job_id}/download` reads the path stored by the backend process and the documented flow can fail with `EXPORT_FILE_MISSING`.
- After updating docs, rerun the documented local smoke sequence or rerun the same local E2E command and report the exact commands in the Task08 handoff.
- Either run full `docker compose up --build` and record the result, or update the deployment docs/status wording so it is clear that Docker is config-validated only and not runtime-validated. Do not present full Docker runtime startup as verified until it has been run.

Verification:
- `find docs/handoffs -maxdepth 1 -type f -name '*task08*' -print`: found `docs/handoffs/2026-05-24-task08-qa-docs-deploy-handoff.md`.
- `rg -n "## Agent Handoff|commands run|E2E|deployment|known limitations|demo script|blockers|Verification|Package|dependency|OpenAPI|Task09|migrations" docs/handoffs/2026-05-24-task08-qa-docs-deploy-handoff.md`: required handoff sections found.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 40 tests, 1 existing Pydantic alias warning.
- `cd frontend && npm test -- --run`: pass, 7 files and 22 tests, with React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `docker compose config`: pass and includes `api`, `frontend`, `worker`, `postgres`, and `redis`.
- `python -m json.tool frontend/src/api/openapi.json`: pass.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_supervisor.sqlite ./.venv313/bin/alembic upgrade head`: pass, through `20260524_0002`.
- Local E2E server startup: pass after port-binding escalation, using backend `127.0.0.1:18000` and frontend `127.0.0.1:5173`.
- `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_supervisor.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_supervisor_exports BACKEND_URL=http://127.0.0.1:18000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e`: pass, 1 Playwright test.
- `git diff --check`: pass.
- A first E2E attempt on frontend port `15173` failed with browser `Failed to fetch` because backend CORS intentionally allows only `localhost:5173` and `127.0.0.1:5173`; this is not counted as an app failure, but it confirms the docs should keep the supported 5173 origin explicit.

Status board update:
- Task08 is marked `needs changes`.
- Task09 remains approved.
- Final signoff remains blocked on Task08 documentation/runtime verification alignment.

Next step:
- Return to QA Docs Deploy Agent to fix the local smoke docs/export path mismatch and clarify or complete full Docker runtime validation. Re-review Task08 after the updated handoff and verification evidence are in the repository.
