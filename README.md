# LabelHub

LabelHub is a full-stack MVP for data annotation workflows used in LLM and agent training data production.

The implemented vertical slice is:

```text
Owner creates a task, imports items, publishes a template
-> Labeler claims an item and submits answers
-> AI review records structured review output
-> Reviewer approves or returns the submission
-> Owner exports approved data
```

## Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, Redis, Celery.
- Agent: LangGraph plus LangChain structured-output model adapters.
- Frontend: React 18, TypeScript, Vite, Ant Design.
- Tests: pytest, Vitest, Playwright.

## Local Backend

```bash
cd backend
python -m venv .venv313
source .venv313/bin/activate
pip install ".[test]"
alembic upgrade head
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

FastAPI serves OpenAPI at `http://localhost:8000/openapi.json`.

## Local Frontend

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Open `http://localhost:5173`.

Current MVP auth uses bearer tokens with role claims. The `/login` route is a disabled placeholder; use `backend/scripts/seed_e2e_data.py tokens` for demo/test role tokens until a real login endpoint is added.

## Verification

```bash
cd backend && ./.venv313/bin/pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
docker compose config
```

E2E smoke test, after the backend and frontend are running against the same database:

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

In a third terminal:

```bash
cd frontend
LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
BACKEND_URL=http://127.0.0.1:8000 \
FRONTEND_URL=http://127.0.0.1:5173 \
npm run e2e
```

## Docker Compose

Task08 has config-validated Docker Compose with `docker compose config`; full `docker compose up --build` runtime startup is not yet recorded as verified.

```bash
docker compose up --build
```

Services:

- API: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- Worker: Celery worker for AI review/export tasks
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

The API container runs `alembic upgrade head` before starting Uvicorn. The frontend receives `VITE_API_BASE_URL=http://localhost:8000`.

## Documentation

- API: `docs/api.md`
- Architecture: `docs/architecture.md`
- Demo script: `docs/demo-script.md`
- Deployment: `docs/deployment.md`
- Known limitations: `docs/known-limitations.md`
- Coordination and task status: `docs/agent-coordination.md`, `docs/status-board.md`
