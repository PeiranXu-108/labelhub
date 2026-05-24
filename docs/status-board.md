# LabelHub Status Board

This board is owned by the Supervisor Agent. Other agents may read it, but should not edit it directly unless explicitly assigned supervisor duties.

## Current Phase

Task09 review integration contracts are approved. QA Docs Deploy is ready to dispatch for full end-to-end validation and documentation.

## Active Agents

| Agent | Task | Status | Last Handoff | Supervisor Decision |
| --- | --- | --- | --- | --- |
| Supervisor Agent | `docs/tasks/00-supervisor-agent.md` | active | initial repository/docs inspection | monitoring |
| Foundation Agent | `docs/tasks/01-foundation-contracts-agent.md` | complete | `docs/handoffs/2026-05-23-task01-foundation-handoff.md` | approved |
| Backend Workflow Agent | `docs/tasks/02-backend-domain-api-agent.md` | complete | `docs/handoffs/2026-05-23-task02-backend-domain-api-handoff.md` | approved |
| Template Agent | `docs/tasks/03-template-schema-agent.md` | complete | `docs/handoffs/2026-05-23-task03-template-schema-handoff.md` | approved |
| AI Review Agent | `docs/tasks/04-ai-review-langgraph-agent.md` | complete | `docs/handoffs/2026-05-23-task04-ai-review-langgraph-handoff.md` | approved |
| Worker Export Agent | `docs/tasks/05-worker-export-agent.md` | complete | `docs/handoffs/2026-05-23-task05-worker-export-handoff.md` | approved |
| Owner Frontend Agent | `docs/tasks/06-frontend-owner-agent.md` | complete | `docs/handoffs/2026-05-24-task06-owner-frontend-handoff.md` | approved |
| Labeler/Reviewer Frontend Agent | `docs/tasks/07-frontend-labeler-reviewer-agent.md` | frontend complete | `docs/handoffs/2026-05-24-task07-labeler-reviewer-frontend-handoff.md` | integration risk |
| Review Integration Contracts Agent | `docs/tasks/09-review-integration-contracts-agent.md` | complete | `docs/handoffs/2026-05-24-task09-review-integration-contracts-handoff.md` | approved |
| QA Docs Deploy Agent | `docs/tasks/08-qa-docs-deploy-agent.md` | ready to dispatch | none | approved to start |

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
- Task 02 API contract is reflected in `frontend/src/api/openapi.json`.
- Task and submission workflow state changes must use `WorkflowService`.
- Template draft API body is `{ "schema": <TemplateDocument> }`.
- Template renderer contract is `SchemaRenderer({ schema, item, initialAnswers?, readOnly?, onChange?, onSubmit? })`.
- Submission draft/save payloads are validated against the stored template snapshot and may return `INVALID_SUBMISSION_PAYLOAD`.
- AI review graph nodes are `load_context`, `build_prompt`, `call_model`, `validate_output`, `retry_or_fail`, `decide_transition`, `persist_review`, and `mark_needs_human_review`.
- AI review model output must validate as `AIReviewResult` and be persisted as structured data; free-form LLM text must not be parsed as truth.
- AI review idempotency key is `<submission_id>:<attempt>`.
- AI review provider configuration is server-side via `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_TEMPERATURE`.
- AI review provider/malformed-output failures after retries transition through `WorkflowService` to `NEEDS_HUMAN_REVIEW`.
- Export APIs are `POST /tasks/{task_id}/exports`, `GET /tasks/{task_id}/exports`, and `GET /exports/{export_job_id}/download`.
- Export formats are `json`, `jsonl`, `csv`, and `xlsx`.
- Export storage root defaults to `storage/exports`, overrideable by `LABELHUB_EXPORT_STORAGE_PATH`.
- Export files use `task-<task_id>-export-<export_job_id>.<extension>` under `<storage_root>/<task_id>/`.
- Export workers may read only existing `approved` and `exportable` submissions and must not create their own workflow/exportability rules.
- Export downloads are limited to task owner or reviewer; labelers must be denied.

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
| Versioned template snapshot reads for assignments/submissions | implement in Task09 | no | decided: required for MVP |
| Reviewer detail AI metadata, human review comments, previous attempts, and AI score filters | implement in Task09 | no | decided: required for MVP |

## Task Status

| Task | Owner Agent | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 00 Supervisor | Supervisor Agent | active | none | Initial docs inspection complete; status board refreshed. |
| 01 Foundation Contracts | Foundation Agent | complete | none | Approved; scaffold, enum contracts, OpenAPI snapshot, and handoff verified. |
| 02 Backend Domain API | Backend Workflow Agent | complete | Task 01 | Approved; core models, migrations, role-aware APIs, workflow service, audit logs, and OpenAPI contract verified. |
| 03 Template Schema | Template Agent | complete | Task 01, Task 02 | Approved; template draft/publish APIs, immutable versions, server-side validation, renderer contract, and OpenAPI snapshot verified. |
| 04 AI Review LangGraph | AI Review Agent | complete | Task 02 skeleton, Task 03 schema | Approved; LangGraph graph, LangChain structured output, idempotency, fallback, worker entrypoint, and handoff verified. |
| 05 Worker Export | Worker Export Agent | complete | Task 02 models, Task 04 review outputs | Approved; export APIs, worker entrypoint, storage, JSON/JSONL/CSV/XLSX writers, permissions, OpenAPI, and handoff verified. |
| 06 Owner Frontend | Owner Frontend Agent | complete | Task 01, API contracts, Task 03 templates, Task 05 exports | Approved; owner task console, dataset import, template workspace, review config, dashboard, export center, handoff, and authenticated export download verified. |
| 07 Labeler Reviewer Frontend | Labeler/Reviewer Frontend Agent | frontend complete / integration risk | Task 01, API contracts, renderer | Audit timeline fix verified; remaining risk is missing backend contracts for historical template snapshots and richer reviewer metadata/filter UX. |
| 09 Review Integration Contracts | Review Integration Contracts Agent | complete | Tasks 02, 03, 04, 07 | Approved; frozen template snapshots, reviewer AI/human/audit detail, previous attempts, server-backed filters, OpenAPI, migration, tests, and handoff verified. |
| 08 QA Docs Deploy | QA Docs Deploy Agent | ready to dispatch | first vertical slice, Task09 approved | E2E and docs; include Task09 reviewer/template contract coverage. |

## Integration Risks

- Backend model fields, especially `TemplateSchema`, must be agreed before Template Agent and Backend Workflow Agent edit related files in parallel.
- Frontend agents must consume shared API/OpenAPI contracts instead of inventing endpoint shapes.
- AI Review Agent must not update submission statuses directly.
- Export Agent must not decide exportable status independently of workflow rules.
- Worker and API code must share workflow/audit services rather than duplicating status logic.
- Backend Workflow Agent becomes the only owner of `backend/app/domain/enums.py` after Task 01; other agents must request enum changes through handoff notes.
- Labeler claim/submit happy path now requires a published `TemplateSchema`; Template Agent should prioritize schema draft/publish endpoints.
- AI Review Agent must still use `WorkflowService.transition_submission(...)`; no direct submission status writes.
- Task03 formal handoff is present and template draft contract is aligned on `schema`.
- Task03 extended `backend/app/services/submissions.py`; downstream agents must handle `INVALID_SUBMISSION_PAYLOAD` from draft save and submit.
- Backend tests currently emit a non-blocking Pydantic alias warning while generating schema; monitor before introducing warning-as-error CI.
- Task04 formal handoff is present and dependency/provider/idempotency/fallback contracts are documented.
- Live LLM provider configuration remains open before production/live AI calls; Task04 tests used mocked/injected model calls only.
- Task05 formal handoff is present and export API/storage/permission contracts are documented.
- `celery[redis]==5.4.0` is declared in `backend/pyproject.toml`, but the current local virtualenv still lacks `celery`; install backend dependencies before running the real Celery worker command.
- Task06 formal handoff is present and owner frontend routes/API consumption/browser validation notes are documented.
- Task06 export download now goes through the authenticated frontend API helper path; keep this bearer-token/base-URL behavior for downstream export UI reuse.
- No owner dashboard endpoint currently exposes submission status counts or AI decision counts; if those aggregates are required for MVP, define a backend API contract before a frontend agent invents local derived semantics.
- Task07 formal handoff is present and labeler/reviewer routes/API consumption/autosave/browser validation notes are documented.
- Task07 reviewer return now refreshes persisted backend audit logs; frontend-fabricated audit timeline entries were removed and regression-tested.
- Task09 closes the current backend/API gaps for versioned template snapshot reads, AI review metadata, human review comments, previous attempts, and server-backed AI score/decision filters.
- Task09 handoff separates owned changes from pre-existing mixed working-tree changes; downstream QA should preserve that file ownership context when reporting failures.
- QA Docs Deploy may now start full E2E coverage and should include Task09 reviewer/template contract scenarios.

## Latest Verification

- Supervisor required reading completed: `docs/technical-solution.md`, `docs/agent-coordination.md`, `docs/status-board.md`, and all files under `docs/tasks/`.
- Repository inspection found backend/frontend scaffold, Docker Compose, generated OpenAPI snapshot, dependency folders, and build output.
- `git status --short` is available; the workspace currently contains uncommitted Task02/Task03 implementation files and Supervisor review documents.
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
- Task 02 handoff reviewed from `docs/handoffs/2026-05-23-task02-backend-domain-api-handoff.md`.
- Task 02 verification: targeted backend tests pass, full backend tests pass, Alembic upgrade pass, OpenAPI JSON validation pass.
- Task 02 review note written to `docs/reviews/2026-05-23-task02-backend-domain-api-review.md`.
- Task 02 re-review confirmed task transitions use `WorkflowService`, default-template bridge was removed, and `tasks.created_by` is non-null.
- Task 02 final verification: targeted backend tests pass, full backend tests pass, Alembic upgrade pass, OpenAPI JSON validation pass.
- Task 02 final approval note written to `docs/reviews/2026-05-23-task02-backend-domain-api-final-review.md`.
- Task 03 review found no formal handoff under `docs/handoffs/`.
- Task 03 verification: `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py` passed, 4 tests.
- Task 03 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 19 tests.
- Task 03 verification: `cd frontend && npm test -- --run` passed, 8 tests.
- Task 03 verification: `cd frontend && npm run build` passed.
- Task 03 verification: `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task03.json` passed.
- Task 03 review note written to `docs/reviews/2026-05-23-task03-template-schema-review.md`.
- Task 03 final handoff reviewed from `docs/handoffs/2026-05-23-task03-template-schema-handoff.md`.
- Task 03 final verification: `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py -q` passed, 5 tests, 1 Pydantic alias warning.
- Task 03 final verification: `cd backend && ./.venv313/bin/pytest -q` passed, 20 tests, 1 Pydantic alias warning.
- Task 03 final verification: `cd frontend && npm test -- --run` passed, 8 tests.
- Task 03 final verification: `cd frontend && npm run build` passed.
- Task 03 final verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed.
- Task 03 final verification: `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task03-rereview.json` passed.
- Task 03 final approval note written to `docs/reviews/2026-05-23-task03-template-schema-final-review.md`.
- Task 04 review found no formal handoff under `docs/handoffs/`.
- Task 04 verification: `cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py` passed, 10 tests.
- Task 04 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 30 tests, 1 existing Pydantic alias warning.
- Task 04 verification: `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task04.json` passed.
- Task 04 verification: `docker compose config >/tmp/labelhub-compose-task04.yaml` passed.
- Task 04 verification: `git diff --check` passed.
- Task 04 review note written to `docs/reviews/2026-05-23-task04-ai-review-langgraph-review.md`.
- Task 04 final handoff reviewed from `docs/handoffs/2026-05-23-task04-ai-review-langgraph-handoff.md`.
- Task 04 final verification: `cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py -q` passed, 10 tests.
- Task 04 final verification: `cd backend && ./.venv313/bin/pytest -q` passed, 30 tests, 1 existing Pydantic alias warning.
- Task 04 final verification: `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task04-rereview.json` passed.
- Task 04 final verification: `docker compose config >/tmp/labelhub-compose-task04-rereview.yaml` passed.
- Task 04 final verification: `git diff --check` passed.
- Task 04 final approval note written to `docs/reviews/2026-05-23-task04-ai-review-langgraph-final-review.md`.
- Task 05 handoff reviewed from `docs/handoffs/2026-05-23-task05-worker-export-handoff.md`.
- Task 05 verification: `cd backend && ./.venv313/bin/pytest tests/test_exports.py tests/test_export_worker.py -q` passed, 7 tests.
- Task 05 verification: `cd backend && ./.venv313/bin/pytest tests/test_ai_review_worker.py tests/test_exports.py tests/test_export_worker.py -q` passed, 8 tests.
- Task 05 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 37 tests, 1 existing Pydantic alias warning.
- Task 05 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed.
- Task 05 verification: `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task05.json` passed.
- Task 05 verification: `docker compose config >/tmp/labelhub-compose-task05.yaml` passed.
- Task 05 verification: `git diff --check` passed.
- Task 05 verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task05_export_review.sqlite ./.venv313/bin/alembic upgrade head` passed.
- Task 05 verification: `cd frontend && npm test -- --run` passed, 8 tests.
- Task 05 verification: `cd frontend && npm run build` passed.
- Task 05 approval note written to `docs/reviews/2026-05-23-task05-worker-export-final-review.md`.
- Task 06 review found no formal handoff under `docs/handoffs/`.
- Task 06 verification: `cd frontend && npm test -- --run` passed, 5 files and 13 tests.
- Task 06 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 06 verification: `git diff --check` passed.
- Task 06 verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 06 review note written to `docs/reviews/2026-05-24-task06-owner-frontend-review.md`.
- Task 06 final handoff reviewed from `docs/handoffs/2026-05-24-task06-owner-frontend-handoff.md`.
- Task 06 final verification: `cd frontend && npm test -- --run` passed, 5 files and 14 tests.
- Task 06 final verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 06 final verification: `git diff --check` passed.
- Task 06 final verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 06 final verification: handoff required sections were found with `rg`.
- Task 06 final approval note written to `docs/reviews/2026-05-24-task06-owner-frontend-final-review.md`.
- Task 07 handoff reviewed from `docs/handoffs/2026-05-24-task07-labeler-reviewer-frontend-handoff.md`.
- Task 07 verification: `cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx` passed, 2 files and 6 tests, with React Router future-flag warnings.
- Task 07 verification: `cd frontend && npm test -- --run` passed, 7 files and 20 tests, with React Router future-flag warnings.
- Task 07 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 07 verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 07 verification: `git diff --check` passed.
- Task 07 review note written to `docs/reviews/2026-05-24-task07-labeler-reviewer-frontend-review.md`.
- Task 07 final handoff re-reviewed from `docs/handoffs/2026-05-24-task07-labeler-reviewer-frontend-handoff.md`.
- Task 07 final verification: `cd frontend && npm test -- --run src/features/reviewer/ReviewerWorkspace.test.tsx` passed, 1 file and 4 tests, with React Router future-flag warnings.
- Task 07 final verification: `cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx` passed, 2 files and 7 tests, with React Router future-flag warnings.
- Task 07 final verification: `cd frontend && npm test -- --run` passed, 7 files and 21 tests, with React Router future-flag warnings.
- Task 07 final verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 07 final verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 07 final verification: `git diff --check` passed.
- Task 07 final verification: handoff required sections were found with `rg`.
- Task 07 final review note written to `docs/reviews/2026-05-24-task07-labeler-reviewer-frontend-final-review.md`.
- Task 09 task file written to `docs/tasks/09-review-integration-contracts-agent.md`.
- Agent coordination updated to insert Task09 before Task08 when Task07 backend/API gaps are MVP requirements.
- Agent prompts updated with Prompt 09 for the Review Integration Contracts Agent.
- Task 08 dependency updated to wait for Task09 if dispatched.
- Task 09 review found no formal handoff under `docs/handoffs/`.
- Task 09 verification: `cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_review_api.py tests/test_review_integration_contracts.py -q` passed, 8 tests, 1 existing Pydantic alias warning.
- Task 09 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 40 tests, 1 existing Pydantic alias warning.
- Task 09 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed.
- Task 09 verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 09 verification: `cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx` passed, 2 files and 8 tests, with React Router future-flag warnings.
- Task 09 verification: `cd frontend && npm test -- --run` passed, 7 files and 22 tests, with React Router future-flag warnings.
- Task 09 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 09 verification: `docker compose config` passed.
- Task 09 verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task09_review.sqlite ./.venv313/bin/alembic upgrade head` passed, including revision `20260524_0002`.
- Task 09 verification: `git diff --check` passed.
- Task 09 review note written to `docs/reviews/2026-05-24-task09-review-integration-contracts-review.md`.
- Task 09 final handoff reviewed from `docs/handoffs/2026-05-24-task09-review-integration-contracts-handoff.md`.
- Task 09 final verification: handoff required sections were found with `rg`.
- Task 09 final verification: `cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_review_api.py tests/test_review_integration_contracts.py -q` passed, 8 tests, 1 existing Pydantic alias warning.
- Task 09 final verification: `cd backend && ./.venv313/bin/pytest -q` passed, 40 tests, 1 existing Pydantic alias warning.
- Task 09 final verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed.
- Task 09 final verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 09 final verification: `cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx` passed, 2 files and 8 tests, with React Router future-flag warnings.
- Task 09 final verification: `cd frontend && npm test -- --run` passed, 7 files and 22 tests, with React Router future-flag warnings.
- Task 09 final verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 09 final verification: `docker compose config` passed.
- Task 09 final verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task09_rereview.sqlite ./.venv313/bin/alembic upgrade head` passed, including revision `20260524_0002`.
- Task 09 final verification: `git diff --check` passed.
- Task 09 final approval note written to `docs/reviews/2026-05-24-task09-review-integration-contracts-final-review.md`.

## Next Recommended Action

Dispatch QA Docs Deploy Agent for Task08. Require it to cover Task09 reviewer/labeler contracts in E2E and docs: frozen template snapshots, labeler returned reason, reviewer queue filters, AI/human/audit detail, previous attempts, migrations, and generated OpenAPI.
