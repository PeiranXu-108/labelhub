# LabelHub Status Board

This board is owned by the Supervisor Agent. Other agents may read it, but should not edit it directly unless explicitly assigned supervisor duties.

## Current Phase

Foundation scaffold approved. Backend workflow implementation is ready to dispatch.

## Active Agents

| Agent | Task | Status | Last Handoff | Supervisor Decision |
| --- | --- | --- | --- | --- |
| Supervisor Agent | `docs/tasks/00-supervisor-agent.md` | active | initial repository/docs inspection | monitoring |
| Foundation Agent | `docs/tasks/01-foundation-contracts-agent.md` | complete | `docs/handoffs/2026-05-23-task01-foundation-handoff.md` | approved |
| Backend Workflow Agent | `docs/tasks/02-backend-domain-api-agent.md` | ready to dispatch | none | approved to start |
| Template Agent | `docs/tasks/03-template-schema-agent.md` | not started | none | waiting |
| AI Review Agent | `docs/tasks/04-ai-review-langgraph-agent.md` | not started | none | waiting |
| Worker Export Agent | `docs/tasks/05-worker-export-agent.md` | not started | none | waiting |
| Owner Frontend Agent | `docs/tasks/06-frontend-owner-agent.md` | not started | none | waiting |
| Labeler/Reviewer Frontend Agent | `docs/tasks/07-frontend-labeler-reviewer-agent.md` | not started | none | waiting |
| QA Docs Deploy Agent | `docs/tasks/08-qa-docs-deploy-agent.md` | not started | none | waiting |

## Frozen Contracts

- Backend language: Python.
- API framework: FastAPI.
- Agent module: LangChain + LangGraph.
- Workflow transitions must use `WorkflowService`.
- Published template schemas are immutable.
- AI review output must be structured.
- Business audit records must be persisted in application tables.
- Frontend validation is advisory only; backend must revalidate template submissions.
- LLM provider credentials must stay server-side and come from environment or secret manager.
- Mutating API endpoints must append audit logs.
- Foundation API contract: `GET /health` returns `{ "status": "ok" }`.
- Foundation generated OpenAPI snapshot path: `frontend/src/api/openapi.json`.
- Foundation enum source of truth: `backend/app/domain/enums.py`.

## Open Decisions

| Decision | Default | Needs User? | Status |
| --- | --- | --- | --- |
| LLM provider | OpenAI-compatible environment config | yes before live AI calls | open |
| Auth mode | JWT username/password MVP | no | defaulted |
| Deployment target | Docker Compose | no | defaulted |
| Database | PostgreSQL | no | defaulted |
| Label assignment mode | manual claim from marketplace | no | defaulted |
| AI auto-return behavior | allowed by thresholds | yes if product policy changes | defaulted |
| Data retention/privacy policy | not defined | yes before handling sensitive uploaded datasets | open |
| Template multi-tab/group layout | later enhancement | yes if required for MVP | defaulted |

## Task Status

| Task | Owner Agent | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 00 Supervisor | Supervisor Agent | active | none | Initial docs inspection complete; status board refreshed. |
| 01 Foundation Contracts | Foundation Agent | complete | none | Approved; scaffold, enum contracts, OpenAPI snapshot, and handoff verified. |
| 02 Backend Domain API | Backend Workflow Agent | ready to dispatch | Task 01 | Owns state machine; must preserve Foundation enum contracts and use `WorkflowService`. |
| 03 Template Schema | Template Agent | not started | Task 01 | Coordinate `TemplateSchema` model with Task 02. |
| 04 AI Review LangGraph | AI Review Agent | not started | Task 02 skeleton, Task 03 schema | Owns LangGraph review graph. |
| 05 Worker Export | Worker Export Agent | not started | Task 02 models | Owns export workers and files. |
| 06 Owner Frontend | Owner Frontend Agent | not started | Task 01, API contracts | Owner console. |
| 07 Labeler Reviewer Frontend | Labeler/Reviewer Frontend Agent | not started | Task 01, API contracts, renderer | Labeler and reviewer surfaces. |
| 08 QA Docs Deploy | QA Docs Deploy Agent | not started | first vertical slice | E2E and docs. |

## Integration Risks

- Backend model fields, especially `TemplateSchema`, must be agreed before Template Agent and Backend Workflow Agent edit related files in parallel.
- Frontend agents must consume shared API/OpenAPI contracts instead of inventing endpoint shapes.
- AI Review Agent must not update submission statuses directly.
- Export Agent must not decide exportable status independently of workflow rules.
- Worker and API code must share workflow/audit services rather than duplicating status logic.
- The workspace is not currently a Git repository, so agents must list changed files explicitly in handoffs until version-control diffing is available.
- Backend Workflow Agent becomes the only owner of `backend/app/domain/enums.py` after Task 01; other agents must request enum changes through handoff notes.

## Latest Verification

- Supervisor required reading completed: `docs/technical-solution.md`, `docs/agent-coordination.md`, `docs/status-board.md`, and all files under `docs/tasks/`.
- Repository inspection found backend/frontend scaffold, Docker Compose, generated OpenAPI snapshot, dependency folders, and build output.
- `git status --short` could not run because `/Users/xupeiran/labelhub` is not currently a Git repository.
- `cd backend && ./.venv313/bin/pytest`: pass, 2 tests passed.
- `cd frontend && npm run build`: pass.
- `cd frontend && npm test -- --run`: pass, 5 tests passed.
- `docker compose config`: pass.
- Review note written to `docs/reviews/2026-05-23-foundation-contracts-review.md`.
- Re-review confirmed corrected enum contracts in `backend/app/domain/enums.py` and `backend/tests/test_enums.py`.
- `python -m json.tool frontend/src/api/openapi.json`: pass; generated OpenAPI snapshot is valid JSON and exposes `/health`.
- Re-review note written to `docs/reviews/2026-05-23-foundation-contracts-rereview.md`.
- Task 01 review rerun: backend tests pass, frontend build pass, frontend tests pass, Docker Compose config pass.
- Task 01 review note written to `docs/reviews/2026-05-23-task01-foundation-review.md`.
- Foundation handoff accepted from `docs/handoffs/2026-05-23-task01-foundation-handoff.md`.
- Final Task 01 verification: backend tests pass, frontend tests pass, frontend build pass, Docker Compose config pass, OpenAPI JSON check pass.
- Final Task 01 approval note written to `docs/reviews/2026-05-23-task01-foundation-final-review.md`.

## Next Recommended Action

Dispatch the Backend Workflow Agent for Task 02. Require it to implement the backend state machine through `WorkflowService`, add migrations with model changes, preserve immutable template schema expectations, and report API/schema changes for downstream Template and Frontend agents.
