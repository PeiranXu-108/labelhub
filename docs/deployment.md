# Deployment

## Docker Compose Deployment

Validate Compose:

```bash
docker compose config
```

Start the MVP stack:

```bash
docker compose up --build
```

Seed the deterministic demo login users after the API migrations have run:

```bash
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

Task08 currently records Docker deployment as config-validated only. Do not treat full Compose runtime startup as verified until `docker compose up --build` has been run and its result is recorded in a handoff or review.

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
LLM_PROVIDER=openai-compatible
LLM_MODEL=<model>
LLM_BASE_URL=<optional-compatible-base-url>
LLM_API_KEY=<secret>
LLM_TEMPERATURE=0
```

Optional:

```text
LABELHUB_EXPORT_STORAGE_PATH=storage/exports
```

## Local Smoke Deployment

For a disposable SQLite smoke run:

```bash
cd backend
env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
./.venv313/bin/alembic upgrade head

env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
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
BACKEND_URL=http://127.0.0.1:8000 \
FRONTEND_URL=http://127.0.0.1:5173 \
npm run e2e
```

## Production Notes

- Replace `LABELHUB_JWT_SECRET_KEY` with a managed secret.
- Use a persistent export storage mount or object storage adapter before storing valuable data.
- Replace demo credentials and define production identity policy before exposing the app to non-demo users.
- MVP auth intentionally excludes self-registration, password reset, OAuth, SSO, refresh tokens, and production account lifecycle policy.
- Configure `LLM_API_KEY` and provider settings before live AI review.
- Define data retention/privacy policy before handling sensitive datasets.
