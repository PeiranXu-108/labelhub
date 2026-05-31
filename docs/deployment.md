# Deployment

## Docker Compose Deployment

Task19 verified Docker runtime startup on 2026-05-31 with Docker Desktop 29.5.2 and Docker Compose v5.1.3. The verified command was:

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
```

The stack built and started `api`, `frontend`, `worker`, `postgres`, and `redis`. The API reached `healthy`, frontend served `/login`, Celery reached `ready`, Postgres accepted connections, Redis returned `PONG`, and API migrations reached `20260531_0007 (head)`.

Use a safe config check when recording logs:

```bash
env LABELHUB_LLM_API_KEY= docker compose config --quiet
```

Plain `docker compose config` is supported, but it prints interpolated environment values. Do not paste that output into tickets or handoffs if a local `.env` contains secrets.

Start the MVP stack without live AI credentials:

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
```

Start with live AI only after credentials and data policy are approved:

```bash
LABELHUB_LLM_API_KEY=<secret> docker compose up --build
```

Seed the deterministic demo login users after the API migrations have run:

```bash
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

Services:

- `api`: FastAPI on `http://localhost:8000`
- `frontend`: Vite dev server on `http://localhost:5173`
- `worker`: Celery worker for AI review and export jobs
- `postgres`: PostgreSQL 16
- `redis`: Redis 7

The API container runs:

```bash
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The worker container runs:

```bash
celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Compose health/dependency order:

- `postgres` uses `pg_isready -U labelhub -d labelhub`.
- `redis` uses `redis-cli ping`.
- `api` waits for healthy Postgres/Redis and exposes a `/health` healthcheck.
- `worker` and `frontend` wait for the API healthcheck.

Storage in Compose:

- `LABELHUB_EXPORT_STORAGE_PATH` defaults to `storage/exports`.
- `LABELHUB_UPLOAD_STORAGE_PATH` defaults to `storage/uploads`.
- Compose mounts named volumes `export-storage` and `upload-storage` into both API and worker containers so worker-written exports are visible to API downloads.
- If you override the storage paths, update the Compose volume mounts to match the new in-container paths.

## Environment

Required for local demo:

```text
LABELHUB_DATABASE_URL=postgresql+psycopg://labelhub:labelhub@localhost:5432/labelhub
LABELHUB_REDIS_URL=redis://localhost:6379/0
LABELHUB_JWT_SECRET_KEY=replace-with-a-local-secret
VITE_API_BASE_URL=http://localhost:8000
```

Seed local demo users with:

```bash
cd backend && ./.venv313/bin/python scripts/seed_e2e_data.py demo-users
```

Demo credentials are `owner@example.com` / `LabelHubOwner123!`, `labeler@example.com` / `LabelHubLabeler123!`, and `reviewer@example.com` / `LabelHubReviewer123!`.

Required before live AI calls:

```text
LABELHUB_LLM_PROVIDER=deepseek
LABELHUB_LLM_MODEL=deepseek-chat
LABELHUB_LLM_BASE_URL=https://api.deepseek.com
LABELHUB_LLM_API_KEY=<secret>
LABELHUB_LLM_TEMPERATURE=0
```

Optional:

```text
LABELHUB_EXPORT_STORAGE_PATH=storage/exports
LABELHUB_UPLOAD_STORAGE_PATH=storage/uploads
```

Secret handling:

- Do not commit real secrets.
- Keep local credentials in an untracked `.env`, a shell environment, or a deployment secret manager.
- Treat Compose-rendered config output as sensitive because it expands `${LABELHUB_LLM_API_KEY}`.
- Replace `LABELHUB_JWT_SECRET_KEY=docker-dev-secret` before any shared or production deployment.

Live AI fallback behavior:

- With `LABELHUB_LLM_API_KEY` absent, `build_review_model` returns `MissingCredentialsReviewModel`; review fallback raises a controlled runtime error and the workflow routes to human review.
- With `LABELHUB_LLM_API_KEY` absent, field-level assist returns a controlled provider-unavailable path instead of exposing credentials or making a model call.
- Task19 did not perform a live provider call because no safe credentials were provided.

## Production Preflight

Run the non-starting preflight before a handoff:

```bash
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh
```

It checks Docker CLI/daemon reachability, safe quiet Compose config validation with `LABELHUB_LLM_API_KEY` blanked unconditionally, environment presence without printing secret values, and local storage write/read probes. It also removes the legacy `/tmp/labelhub-compose-config.yaml` artifact path before validation so stale rendered configs are not left behind by older script runs.

Run runtime smoke on a Docker-enabled host:

```bash
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh --runtime
```

Runtime mode starts Compose detached, checks API `/health`, frontend `/login`, Postgres, Redis, Alembic head, API storage write/read, worker-to-API shared export storage visibility, and Celery ping.

## Local Smoke Deployment

For a disposable SQLite smoke run:

```bash
cd backend
env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_e2e_uploads \
./.venv313/bin/alembic upgrade head

env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_e2e_uploads \
./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

Then run:

```bash
cd frontend
LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_e2e_uploads \
BACKEND_URL=http://127.0.0.1:8000 \
FRONTEND_URL=http://127.0.0.1:5173 \
npm run e2e
```

Task20 verified this local SQLite smoke path with `LABELHUB_REDIS_URL=redis://127.0.0.1:6399/0` and no Redis process listening. In that mode export creation returns `202` with a `pending` job if Celery publish fails; the Playwright helper then runs `backend/scripts/seed_e2e_data.py run-export <export_job_id>` synchronously and downloads the generated file.

## Production Notes

- Replace `LABELHUB_JWT_SECRET_KEY` with a managed secret.
- Compose now uses named local volumes for export and upload storage, but a production deployment still needs a backup/retention policy or an object storage adapter before storing valuable data.
- Upload storage defaults to local filesystem storage under `LABELHUB_UPLOAD_STORAGE_PATH` (`storage/uploads` by default). Files are stored under `<storage_root>/<task_id>/<assignment_id>/`; cleanup is manual for the MVP, and deleting database rows does not automatically remove local files.
- Replace local upload storage with a production object storage design before production file/image collection.
- Task 14 upload storage does not provide antivirus scanning, DLP, content moderation, automatic retention, or legal hold guarantees.
- Replace demo credentials and define production identity policy before exposing the app to non-demo users.
- MVP auth intentionally excludes self-registration, password reset, OAuth, SSO, refresh tokens, and production account lifecycle policy.
- Configure `LABELHUB_LLM_API_KEY` and provider settings before live AI review.
- Define data retention/privacy policy before handling sensitive datasets.
- The frontend container runs the Vite development server for MVP demonstration; replace it with a static production server or platform build before internet exposure.
- The current worker image runs Celery as root and emits Celery's `ROOT_DISCOURAGED` security warning; use a non-root image/user for production hardening.
- Full Playwright E2E against the local SQLite smoke setup is green as of Task20. Full Playwright E2E against the live Docker worker is not green yet because the deterministic E2E helper flow is separate from the live worker runtime. See `docs/known-limitations.md`.
