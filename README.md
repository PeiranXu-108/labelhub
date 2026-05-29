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
python scripts/seed_e2e_data.py demo-users
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

MVP auth uses persisted demo users plus JWT bearer tokens. Seed the demo users with `backend/scripts/seed_e2e_data.py demo-users`, then sign in at `/login` with:

- Owner: `owner@example.com` / `LabelHubOwner123!`
- Labeler: `labeler@example.com` / `LabelHubLabeler123!`
- Reviewer: `reviewer@example.com` / `LabelHubReviewer123!`

Business routes still enforce role permissions on the backend. The legacy `backend/scripts/seed_e2e_data.py tokens` helper remains for API/E2E helpers, but it now seeds matching persisted users before printing tokens.

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

The Playwright smoke test signs into the frontend through `/login` for the role-route checks.

## Live AI Review Agent

LabelHub defaults live AI review to DeepSeek through its OpenAI-compatible API. Add your key to `.env` before starting the API and worker:

```bash
LABELHUB_LLM_PROVIDER=deepseek
LABELHUB_LLM_MODEL=deepseek-chat
LABELHUB_LLM_BASE_URL=https://api.deepseek.com
LABELHUB_LLM_API_KEY=
LABELHUB_LLM_TEMPERATURE=0
```

After a labeler submits an assignment, the API enqueues `ai_review.run_ai_review`; the Celery worker calls DeepSeek and writes the persisted AI review, status transition, prompt snapshot, structured response, and audit events. The owner, labeler, and reviewer screens show the agent workflow without exposing provider or API-key controls.

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

Seed demo users in the running API container before using `/login`:

```bash
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

## Documentation

- API: `docs/api.md`
- Architecture: `docs/architecture.md`
- Demo script: `docs/demo-script.md`
- Deployment: `docs/deployment.md`
- Known limitations: `docs/known-limitations.md`
- Coordination and task status: `docs/agent-coordination.md`, `docs/status-board.md`
