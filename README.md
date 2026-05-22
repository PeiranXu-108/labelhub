# LabelHub

LabelHub is an MVP data annotation platform scaffold. This repository currently contains the foundation contracts only: a FastAPI backend, a React/Vite frontend shell, base domain enums, test runners, and Docker Compose services.

## Stack

- Backend: Python 3.12+, FastAPI, Pydantic Settings, SQLAlchemy 2, PostgreSQL, Redis.
- Frontend: React 18, TypeScript, Vite, Ant Design, React Router, Zustand.
- Package managers: `pip` for backend installs from `backend/pyproject.toml`, `npm` for frontend installs from `frontend/package.json`.

## Local Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install ".[test]"
pytest
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

## Local Frontend

```bash
cd frontend
npm install
npm run test
npm run build
npm run dev
```

Open the app at `http://localhost:5173`.

## Docker Compose

```bash
docker compose up --build
```

Services:

- API: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## API Contract

FastAPI serves the live OpenAPI schema at:

```text
http://localhost:8000/openapi.json
```

Generate the frontend contract snapshot with:

```bash
cd backend
python scripts/export_openapi.py
```

The generated snapshot is written to:

```text
frontend/src/api/openapi.json
```

Downstream agents should preserve these initial contracts:

- `backend/app/domain/enums.py` is the source of truth for foundation enum values.
- `backend/app/main.py` exposes `/health` and the OpenAPI document.
- `frontend/src/api/openapi.json` should be generated from FastAPI, not manually forked.
- Placeholder frontend routes exist at `/login`, `/owner/tasks`, `/labeler/tasks`, and `/review/queue`.

This foundation intentionally does not implement task, submission, review, export, workflow, audit-log, or AI review business logic.
