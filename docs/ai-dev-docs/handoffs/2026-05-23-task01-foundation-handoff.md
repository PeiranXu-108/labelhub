# Task 01 Foundation Contracts Handoff - 2026-05-23

## Agent Handoff

Agent: Foundation Agent
Task file: docs/tasks/01-foundation-contracts-agent.md
Status: ready for review

Changed files:
- .gitignore
- .env.example
- README.md
- docker-compose.yml
- backend/Dockerfile
- backend/pyproject.toml
- backend/app/__init__.py
- backend/app/main.py
- backend/app/api/__init__.py
- backend/app/api/routes/__init__.py
- backend/app/api/routes/health.py
- backend/app/core/__init__.py
- backend/app/core/config.py
- backend/app/core/security.py
- backend/app/db/__init__.py
- backend/app/db/session.py
- backend/app/domain/__init__.py
- backend/app/domain/enums.py
- backend/scripts/export_openapi.py
- backend/tests/test_enums.py
- backend/tests/test_health.py
- frontend/Dockerfile
- frontend/index.html
- frontend/package.json
- frontend/package-lock.json
- frontend/tsconfig.json
- frontend/tsconfig.app.json
- frontend/tsconfig.node.json
- frontend/vite.config.ts
- frontend/src/App.tsx
- frontend/src/main.tsx
- frontend/src/styles.css
- frontend/src/__tests__/App.test.tsx
- frontend/src/api/README.md
- frontend/src/api/openapi.json
- frontend/src/routes/LabelerTasksPage.tsx
- frontend/src/routes/LoginPage.tsx
- frontend/src/routes/OwnerTasksPage.tsx
- frontend/src/routes/ReviewQueuePage.tsx
- frontend/src/test/setup.ts
- docs/handoffs/2026-05-23-task01-foundation-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest -q: pass, 2 tests passed
- cd frontend && npm test -- --run: pass, 5 tests passed
- cd frontend && npm run build: pass
- docker compose config: pass
- python -m json.tool frontend/src/api/openapi.json > /tmp/labelhub-openapi-check.json: pass
- rg "## Agent Handoff" docs: pass, this handoff is discoverable in docs/handoffs/2026-05-23-task01-foundation-handoff.md

Contract changes:
- Package managers chosen: backend uses pip with backend/pyproject.toml; frontend uses npm with frontend/package.json and frontend/package-lock.json.
- Backend pinned dependencies: fastapi==0.115.6, uvicorn[standard]==0.34.0, pydantic-settings==2.7.1, sqlalchemy==2.0.36, alembic==1.13.3, psycopg[binary]==3.2.3, pyjwt==2.10.1, passlib[bcrypt]==1.7.4, httpx==0.28.1, pytest==8.3.4, pytest-asyncio==0.25.0.
- Frontend pinned dependencies: react==18.3.1, react-dom==18.3.1, vite==5.4.11, typescript==5.7.2, antd==5.22.7, react-router-dom==6.28.1, zustand==5.0.2, vitest==2.1.8, @testing-library/react==16.1.0, @testing-library/jest-dom==6.6.3.
- Generated OpenAPI snapshot path: frontend/src/api/openapi.json.
- Live OpenAPI path when API is running: /openapi.json.
- Health endpoint contract: GET /health returns {"status": "ok"}.
- Domain enum contract source: backend/app/domain/enums.py.
- UserRole values: owner, labeler, reviewer, ai_agent.
- TaskStatus values: draft, published, paused, ended.
- SubmissionStatus values: draft, submitted, ai_reviewing, ai_passed, ai_returned, needs_human_review, human_reviewing, approved, returned, exportable.
- AIReviewDecision values: pass, return, human_review.
- ExportFormat values: json, jsonl, csv, xlsx.
- Frontend placeholder routes: /login, /owner/tasks, /labeler/tasks, /review/queue.
- Docker Compose services: api, frontend, postgres, redis.
- No task, submission, review, export, workflow, audit-log, worker, or AI agent business logic was implemented in Task 01.

Blockers:
- none

Requests for Supervisor:
- Review and approve Task 01 now that the formal handoff is present in the repository.
- If approved, dispatch Backend Workflow Agent for docs/tasks/02-backend-domain-api-agent.md.
