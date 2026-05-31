## Agent Handoff

Agent: Production Readiness Agent
Task file: docs/tasks/19-production-readiness-agent.md
Status: ready for review

Changed files:
- backend/alembic/versions/20260531_0004_task_metadata_rewards.py
- docker-compose.yml
- scripts/production_preflight.sh
- README.md
- docs/deployment.md
- docs/demo-script.md
- docs/known-limitations.md
- docs/handoffs/2026-05-31-task19-production-readiness-handoff.md

Verification run:
- `command -v docker`: pass, `/usr/local/bin/docker`.
- `docker info`: pass, Docker Desktop Server 29.5.2 reachable.
- `docker compose version`: pass, Docker Compose v5.1.3.
- `env LABELHUB_LLM_API_KEY= docker compose config --quiet`: pass. Raw `docker compose config` is supported but can print local `.env` secrets, so secret-bearing output was not recorded.
- `env LABELHUB_LLM_API_KEY= docker compose up --build`: pass with final Compose file. API, frontend, worker, Postgres, and Redis built and started; stack was stopped after smoke verification.
- `curl -fsS http://127.0.0.1:8000/health`: pass, `{"status":"ok"}`.
- `curl -fsS -o /tmp/labelhub_task19_frontend_login.html -w '%{http_code} %{content_type}\n' http://127.0.0.1:5173/login`: pass, `200 text/html`.
- `docker compose exec -T postgres pg_isready -U labelhub -d labelhub`: pass, accepting connections.
- `docker compose exec -T redis redis-cli ping`: pass, `PONG`.
- `docker compose exec -T api alembic current`: pass, `20260531_0007 (head)`.
- `docker compose exec -T worker celery -A app.workers.celery_app.celery_app inspect ping --timeout=5`: pass, `1 node online`.
- API storage write/read probe in Compose: pass for `LABELHUB_EXPORT_STORAGE_PATH=storage/exports` and `LABELHUB_UPLOAD_STORAGE_PATH=storage/uploads`.
- Worker-to-API shared export storage probe in Compose: pass, API read `worker-ok` marker written by worker.
- Live AI missing-key preflight in Compose: pass, provider defaults resolved to DeepSeek config, `LABELHUB_LLM_API_KEY=ABSENT`, review model `MissingCredentialsReviewModel`, field-assist model `MissingCredentialsFieldAssistModel`, both raised controlled missing-key `RuntimeError`s. No live model call was made.
- `env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh`: pass, Docker/daemon/config/env/storage checks completed; runtime smoke intentionally skipped without `--runtime`.
- `rm -f /tmp/labelhub-compose-config.yaml && env LABELHUB_LLM_API_KEY=fake-task19-review-key scripts/production_preflight.sh && test ! -e /tmp/labelhub-compose-config.yaml`: pass, preflight blanks the key for quiet Compose validation and does not leave the legacy rendered config file behind.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 119 tests, existing passlib `crypt` and Pydantic alias warnings.
- `cd backend && env LABELHUB_DATABASE_URL=postgresql+psycopg://labelhub:labelhub@127.0.0.1:5432/labelhub_task19_migration ./.venv313/bin/alembic upgrade head`: pass against throwaway Postgres database through `20260531_0007`; database was dropped after the check.
- `cd frontend && npm test -- --run`: pass, 75 tests, existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, existing Vite chunk-size warning.
- `cd frontend && env LABELHUB_DATABASE_URL=postgresql+psycopg://labelhub:labelhub@127.0.0.1:5432/labelhub LABELHUB_REDIS_URL=redis://127.0.0.1:6379/0 LABELHUB_EXPORT_STORAGE_PATH=storage/exports LABELHUB_UPLOAD_STORAGE_PATH=storage/uploads BACKEND_URL=http://127.0.0.1:8000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e`: fail, supported command but not green against live Docker worker. `auth-login.spec.ts` waits for English `Email` label while UI exposes Chinese labels; `labelhub-happy-path.spec.ts` expects deterministic AI review `pass`, but the Docker worker consumes the review with missing live-AI credentials and routes it to human review first.
- `git diff --check`: pass.

Contract changes:
- No user-facing feature semantics were changed.
- Docker Compose now adds healthchecks/dependency ordering so API waits for Postgres/Redis, and worker/frontend wait for healthy API.
- Docker Compose now mounts named `export-storage` and `upload-storage` volumes into API and worker so Docker-local export/upload storage paths are shared.
- Migration `20260531_0004_task_metadata_rewards` now escapes JSON `:` characters in the SQLAlchemy text default so PostgreSQL/SQLite migrations compile JSON null literals correctly.
- Added `scripts/production_preflight.sh` for safe Docker/config/env/storage/runtime preflight without printing secrets or writing expanded Compose config.

Blockers:
- Full Playwright E2E is not green against live Docker worker for the reasons above.
- Live AI calls were not verified because no safe provider credentials were supplied.
- Frontend Docker runtime is still Vite dev server, not a hardened production static server.
- Celery worker container runs as root and emits the upstream security warning.
- Production identity, data retention/privacy, live-AI provider policy, object storage/scanning/retention, and payout policy remain open owner decisions.

Requests for Supervisor:
- Decide whether the Docker-local shared named volumes are acceptable for MVP handoff or whether object storage/bind-mounted durable paths are required before external review.
- Decide whether to split E2E into deterministic local mode and live-worker Docker mode, or update the current Playwright suite to handle both.
- Decide whether Task19 approval can proceed with live-AI missing-key fallback verified but no real provider call.

Docker availability and runtime status:
- Docker CLI and daemon were available.
- Runtime startup is verified for the final Compose file by `env LABELHUB_LLM_API_KEY= docker compose up --build`.
- Containers were stopped after verification; no runtime is intentionally left running.

Compose config/startup evidence:
- Safe config validation passed with `LABELHUB_LLM_API_KEY` explicitly blanked.
- Compose created `labelhub_export-storage` and `labelhub_upload-storage` named volumes.
- `docker compose ps` during smoke showed API healthy, Postgres healthy, Redis healthy, frontend up, and worker up.

Backend/frontend/worker smoke status:
- Backend `/health`: pass.
- Frontend `/login`: pass.
- Worker Celery ping: pass.
- Postgres connectivity: pass.
- Redis connectivity: pass.
- Alembic head: pass.
- API storage read/write: pass.
- Worker-written export marker readable by API: pass.

E2E status:
- Unit/build checks pass.
- Full Playwright E2E against Docker runtime fails due stale login-label selectors and deterministic AI assumptions conflicting with live worker missing-key fallback.

Live AI preflight status:
- Missing-key fallback verified.
- No live provider call made.
- Docs now distinguish missing-key fallback, deterministic helper demo, and live-AI mode.

Docs updated:
- `README.md`: Docker runtime status, safe Compose config, preflight script, shared storage, missing-key fallback, E2E Docker blocker.
- `docs/deployment.md`: startup commands, env vars, secret handling, storage paths/volumes, preflight script, production notes.
- `docs/demo-script.md`: default missing-key fallback demo, deterministic helper mode, live-AI mode, Docker export worker note.
- `docs/known-limitations.md`: verified limitations, environment blockers, production policy gaps, and feature/test blockers.

Remaining production blockers:
- Green Docker-mode E2E.
- Live provider verification with safe credentials and approved data policy.
- Production static frontend serving.
- Non-root worker image/user.
- Durable/object storage, scanning, retention, and backup policy.
- Production identity/account lifecycle policy.
