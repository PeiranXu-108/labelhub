# Task 21: Limitations Remediation Agent

## Mission

Close or explicitly product-gate the residual limitations documented in `docs/known-limitations.md` after Task20 approval.

This agent owns the difference between an MVP demo and a production-facing readiness story. It must fix concrete engineering limitations where the repository already has enough context, and it must produce clear decision records for policy/product gaps that cannot be safely solved by code alone.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/known-limitations.md`
- `docs/deployment.md`
- `docs/demo-script.md`
- `README.md`
- `docs/reviews/2026-06-01-task20-final-readiness-fixes-review.md`
- `docker-compose.yml`
- `frontend/Dockerfile`
- `backend/Dockerfile`
- `scripts/production_preflight.sh`
- `frontend/e2e/auth-login.spec.ts`
- `frontend/e2e/labelhub-happy-path.spec.ts`
- Backend tests covering auth, exports, uploads, AI review, field assist, review stages, and task APIs.

## Dependencies

- Task20 is approved.
- Docker Desktop is required for runtime validation. If Docker is unavailable, record the exact shell error and do not claim Docker runtime or Docker-mode E2E verification.
- Live AI verification requires a safe `LABELHUB_LLM_API_KEY` supplied outside git. If no key is provided, verify only the missing-key fallback path and keep live AI as a documented blocker.
- Production identity, retention, scanning, object storage, and payout decisions require product/security owner approval before implementation.

## Owned Areas

- `frontend/Dockerfile`
- `frontend/nginx.conf` or an equivalent frontend static-server config
- `backend/Dockerfile`
- `docker-compose.yml`
- `scripts/production_preflight.sh`
- `frontend/e2e/`
- `backend/scripts/seed_e2e_data.py` only for smoke helpers
- `backend/app/api/routes/*` and `backend/app/services/*` only for dashboard aggregate or smoke-readiness endpoints explicitly described below
- `backend/tests/*`
- `frontend/src/features/owner/TaskDashboard.tsx`
- `frontend/src/features/owner/api.ts`
- `frontend/src/features/owner/types.ts`
- `docs/known-limitations.md`
- `docs/deployment.md`
- `docs/demo-script.md`
- `README.md`
- Create: `docs/production-policy-decisions.md`
- Create: `docs/handoffs/<date>-task21-limitations-remediation-handoff.md`

## Non-Owned Areas

- Do not implement real payouts, payment ledgers, tax handling, or payment-provider calls.
- Do not implement self-registration, OAuth, SSO, or password reset unless the Supervisor supplies an identity-provider decision.
- Do not add live AI credentials, test keys, screenshots of secrets, or expanded `.env` output to git.
- Do not claim antivirus, DLP, legal hold, cloud backup, or object-storage durability unless the implementation actually integrates and verifies those systems.
- Do not rewrite workflow state semantics, template immutability, AI review decisions, assignment claiming, or review-stage rules.

## Limitation Coverage Matrix

| Current limitation | Target outcome | Owner decision required |
| --- | --- | --- |
| Frontend Docker uses Vite dev server | Replace with static production build/server in Compose | No |
| Celery worker runs as root | Run API/worker containers as non-root app user without breaking storage writes | No |
| Docker-mode E2E not green | Either make Docker-mode smoke green or document exact remaining blocker with evidence | No, unless blocker is external |
| Owner dashboard aggregates are frontend-derived | Add a dedicated backend aggregate endpoint and consume it | No |
| Live AI not verified | Verify missing-key fallback; verify live call only when safe key is supplied | Yes for live key |
| Local export/upload storage lacks retention/backup/object-storage policy | Add decision record and deployment warnings; implement only safe local cleanup hooks if approved | Yes |
| Uploads lack antivirus/DLP/content moderation/legal hold | Add decision record and keep limitation unless an approved scanning provider is supplied | Yes |
| Auth is seeded-user MVP JWT only | Add production identity decision record; keep limitation unless provider/scope is approved | Yes |
| Reward rules are metadata only | Keep as explicit non-goal unless payment scope is approved | Yes |
| Data retention/privacy policy undefined | Add decision record with explicit safe default: do not use sensitive production data | Yes |
| Multistage review staffing/SLA policy undefined | Add decision record; no code change unless workflow escalation policy is supplied | Yes |

## Required Workstreams

### Workstream 1: Baseline and Inventory

- [ ] Run `git status --short`.
- [ ] Read `docs/known-limitations.md` and copy each limitation into the handoff with one of these statuses: `fixed`, `verified blocker`, `policy gated`, or `intentionally retained`.
- [ ] Run baseline verification before edits:

```bash
cd backend && ./.venv313/bin/pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
git diff --check
```

Expected baseline: tests/build/config pass, with existing passlib/Pydantic/React Router/Vite warnings acceptable only if unchanged.

### Workstream 2: Production Frontend Container

Goal: remove the Vite dev server from Docker runtime.

- [ ] Replace `frontend/Dockerfile` with a multi-stage build that runs `npm ci`, builds Vite, and serves `dist/` through an unprivileged static server.
- [ ] Add `frontend/nginx.conf` with SPA fallback to `/index.html`.
- [ ] Update `docker-compose.yml` so `frontend` passes `VITE_API_BASE_URL` as a build arg and maps host port `5173` to the container static-server port.
- [ ] Verify `curl -fsS http://127.0.0.1:5173/login` returns HTML after `docker compose up --build -d`.
- [ ] Update `README.md`, `docs/deployment.md`, and `docs/known-limitations.md` to remove the Vite dev-server limitation only after the runtime check succeeds.

Suggested implementation shape:

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src

ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

Suggested `frontend/nginx.conf`:

```nginx
server {
  listen 8080;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
}
```

### Workstream 3: Non-Root Backend Runtime

Goal: remove the Celery `ROOT_DISCOURAGED` warning and run API/worker as a non-root app user.

- [ ] Modify `backend/Dockerfile` so dependencies are installed before switching user, app files are owned by the runtime user, and `/app/storage/exports` plus `/app/storage/uploads` are writable.
- [ ] Verify API startup, migrations, worker startup, export file write, and upload file write still work with named volumes.
- [ ] Update `scripts/production_preflight.sh --runtime` to print the API and worker container user IDs without leaking secrets.
- [ ] Remove the root-worker limitation from `docs/known-limitations.md` only after worker logs no longer emit Celery `ROOT_DISCOURAGED`.

Suggested implementation shape:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir ".[test]"

RUN groupadd --system labelhub && useradd --system --gid labelhub --home-dir /app labelhub

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

RUN mkdir -p /app/storage/exports /app/storage/uploads \
  && chown -R labelhub:labelhub /app

USER labelhub

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Workstream 4: Dedicated Owner Dashboard Aggregates

Goal: close the limitation that dashboard aggregates are not backed by a dedicated endpoint.

- [ ] Add backend tests for a task dashboard summary endpoint. It must return task item counts, submission status counts, AI decision counts, latest export jobs, and latest audit entries for the owner.
- [ ] Implement the endpoint under `backend/app/api/routes/tasks.py` or a focused dashboard route following existing role checks.
- [ ] Add schemas in `backend/app/schemas/task.py` or a new focused schema module.
- [ ] Consume the endpoint in `frontend/src/features/owner/TaskDashboard.tsx` through `frontend/src/features/owner/api.ts`.
- [ ] Update frontend tests so the dashboard renders server-provided aggregate counts instead of deriving all counts from the current page payload.
- [ ] Remove the owner-dashboard aggregate limitation only after backend and frontend tests pass.

Minimum API contract:

```json
{
  "task_id": "task-id",
  "item_counts": { "available": 1, "assigned": 2, "completed": 3, "skipped": 0 },
  "submission_counts": { "draft": 1, "submitted": 2, "approved": 3, "returned": 0 },
  "ai_decision_counts": { "pass": 2, "return": 1, "human_review": 1 },
  "latest_export_jobs": [],
  "latest_audit_logs": []
}
```

### Workstream 5: Docker-Mode E2E Reality Check

Goal: make Docker-mode E2E truthful.

- [ ] Start the Docker stack with a blank LLM key:

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build -d
docker compose exec -T api python scripts/seed_e2e_data.py demo-users
```

- [ ] Run a Docker-mode smoke against `http://127.0.0.1:8000` and `http://127.0.0.1:5173`.
- [ ] If the existing `frontend/e2e/labelhub-happy-path.spec.ts` still relies on deterministic local helpers, either add a Docker-safe smoke spec or add a mode switch that uses live worker/fallback behavior without direct SQLite helper assumptions.
- [ ] Keep local deterministic E2E intact.
- [ ] Update `docs/known-limitations.md`:
  - If Docker-mode E2E passes, remove the Docker-mode E2E limitation and add the exact command to `docs/deployment.md`.
  - If it fails for an external reason, keep the limitation and record the exact failing command, HTTP status, and service logs to inspect.

Required commands:

```bash
cd frontend && env \
  BACKEND_URL=http://127.0.0.1:8000 \
  FRONTEND_URL=http://127.0.0.1:5173 \
  npm run e2e
docker compose logs --no-color api worker frontend > /tmp/labelhub-task21-compose.log
```

### Workstream 6: Live AI and Field-Assist Verification Gate

Goal: separate “fallback verified” from “live provider verified”.

- [ ] Verify missing-key behavior:

```bash
cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_llm_field_assist.py tests/test_agent_providers.py -q
```

- [ ] If a safe live key is provided in the shell, run one live AI review and one field-level assist smoke through the API or an isolated script. Do not print the key or full provider config.
- [ ] If no safe key is provided, keep live AI as `policy/environment gated` in `docs/known-limitations.md`.
- [ ] Update `scripts/production_preflight.sh` only if it can report live-AI readiness without printing secrets.
- [ ] Update `docs/demo-script.md` to distinguish missing-key fallback, deterministic helper, and live AI paths.

### Workstream 7: Production Policy Decision Record

Goal: convert policy limitations into explicit owner decisions rather than ambiguous engineering defects.

- [ ] Create `docs/production-policy-decisions.md`.
- [ ] Include these sections with a status field set to `required before production` unless an owner has already supplied a decision:
  - data retention and privacy
  - dataset import retention
  - live AI prompt/response retention, redaction, provider region, and provider logging
  - field-level LLM assist prompt/response retention
  - upload storage, backup, deletion, antivirus, DLP, content moderation, legal hold
  - authentication lifecycle and identity provider
  - reward/payment execution policy
  - multistage review staffing, escalation, and SLA
- [ ] Link this decision record from `README.md`, `docs/deployment.md`, and `docs/known-limitations.md`.
- [ ] Do not remove a policy limitation from `docs/known-limitations.md` unless the decision record includes a concrete approved production policy and the repository implements or clearly documents the required operational control.

Suggested decision-record shape:

```markdown
# Production Policy Decisions

## Data Retention and Privacy

Status: required before production

Decision: LabelHub must not process sensitive production datasets until the owner defines retention duration, deletion process, backup scope, and data classification rules.

Repository behavior today: local database rows, uploaded files, prompt snapshots, and exports persist until manually deleted.

Required production control: define retention duration, deletion owner, backup policy, and audit expectations before enabling production data.
```

### Workstream 8: Documentation Reconciliation

Goal: make docs match the new evidence and remaining limitations.

- [ ] Update `docs/known-limitations.md` so it has only current limitations. Every remaining item must include one of:
  - exact missing external input
  - exact policy decision required
  - exact unsupported production guarantee
  - exact command that failed
- [ ] Update `README.md` verification and Docker sections.
- [ ] Update `docs/deployment.md` with static frontend runtime, non-root backend runtime, storage behavior, Docker-mode E2E status, and production policy links.
- [ ] Update `docs/demo-script.md` if the demo path or live-AI wording changes.
- [ ] Create the Task21 handoff.

## Required Verification Commands

Run all commands supported by the local environment. Do not claim unsupported commands passed.

```bash
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task21-openapi.json
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh --runtime
cd frontend && env BACKEND_URL=http://127.0.0.1:8000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e
git diff --check
```

If Docker is unavailable, record:

```bash
command -v docker
docker info
```

and keep Docker runtime/E2E claims out of the completion summary.

## Handoff Requirements

Create `docs/handoffs/<date>-task21-limitations-remediation-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- limitation coverage matrix with final status for each item
- exact limitations removed from `docs/known-limitations.md`
- exact limitations retained and why
- Docker runtime evidence
- whether frontend uses a production static server in Docker
- whether API/worker run as non-root
- whether Docker-mode E2E is green
- whether live AI was fallback-only or live-verified
- policy decisions created or still required
- verification commands and pass/fail results
- any new risks or requested Supervisor decisions

## Completion Criteria

Task21 is complete only when:

- all concrete engineering limitations in this task are fixed or have exact verified blockers
- policy limitations are captured in `docs/production-policy-decisions.md`
- docs no longer overclaim production readiness
- local tests/build pass
- Docker runtime checks pass when Docker is available
- the handoff gives Supervisor enough evidence to approve or return targeted changes
