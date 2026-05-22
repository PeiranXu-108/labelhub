# Task 01: Foundation Contracts Agent

## Mission

Create the project scaffold and shared contracts that all other agents depend on.

This task must avoid implementing deep business workflows. It establishes the repo layout, dependency files, base app bootstraps, shared enums, API health checks, and contract-generation path.

## Dependencies

None. This is the first implementation task.

## Owned Areas

- `backend/`
- `frontend/`
- root dependency/config files
- initial shared API contract setup

## Expected Deliverables

- Python FastAPI backend scaffold.
- React + TypeScript + Vite frontend scaffold.
- Backend config, database session, health endpoint.
- Initial domain enum definitions.
- Test runner setup for backend and frontend.
- Docker Compose skeleton with API, frontend, Postgres, Redis.

## Implementation Steps

- [ ] Create backend package structure:
  - `backend/app/main.py`
  - `backend/app/core/config.py`
  - `backend/app/core/security.py`
  - `backend/app/db/session.py`
  - `backend/app/domain/enums.py`
  - `backend/app/api/routes/health.py`
  - `backend/tests/`
- [ ] Add Python dependency management with `pyproject.toml`.
- [ ] Add backend dependencies:
  - `fastapi`
  - `uvicorn`
  - `pydantic-settings`
  - `sqlalchemy`
  - `alembic`
  - `psycopg`
  - `python-jose` or `pyjwt`
  - `passlib`
  - `pytest`
  - `pytest-asyncio`
  - `httpx`
- [ ] Implement `/health` returning `{ "status": "ok" }`.
- [ ] Define initial enums:
  - `UserRole`
  - `TaskStatus`
  - `SubmissionStatus`
  - `AIReviewDecision`
  - `ExportFormat`
- [ ] Create frontend scaffold under `frontend/`.
- [ ] Add frontend dependencies:
  - React
  - TypeScript
  - Vite
  - Ant Design or Semi Design
  - Zustand
  - React Router
- [ ] Create frontend routes with placeholder pages only:
  - `/login`
  - `/owner/tasks`
  - `/labeler/tasks`
  - `/review/queue`
- [ ] Add Docker Compose skeleton:
  - API service
  - frontend service
  - Postgres service
  - Redis service
- [ ] Add root README with local startup commands.

## Required Tests

- Backend:
  - `GET /health` returns 200 and status ok.
  - enum import smoke test.
- Frontend:
  - app renders without crashing.
  - route placeholders render expected headings.

## Verification Commands

Use the commands that match the selected package managers. Recommended:

```bash
cd backend && pytest
cd frontend && npm run build
```

## Handoff Requirements

Report:

- exact package managers chosen
- dependency versions if pinned
- generated OpenAPI path, if available
- any contracts that downstream agents must preserve

