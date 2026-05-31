# LabelHub Status Board

This board is owned by the Supervisor Agent. Other agents may read it, but should not edit it directly unless explicitly assigned supervisor duties.

## Current Phase

Tasks 11-16 are approved expanded-scope follow-ups. Tasks 17-19 remain drafted/pending dispatch before any expanded-scope MVP readiness claim.

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
| QA Docs Deploy Agent | `docs/tasks/08-qa-docs-deploy-agent.md` | complete | `docs/handoffs/2026-05-25-task08-qa-docs-deploy-handoff.md` | approved |
| Auth Login Agent | `docs/tasks/10-auth-login-agent.md` | complete | `docs/handoffs/2026-05-28-task10-auth-login-handoff.md` | approved |
| Task Metadata and Rewards Agent | `docs/tasks/11-task-metadata-rewards-agent.md` | complete | `docs/handoffs/2026-05-31-task11-task-metadata-rewards-handoff.md` | approved |
| Dataset Import Pipeline Agent | `docs/tasks/12-dataset-import-pipeline-agent.md` | complete | `docs/handoffs/2026-05-31-task12-dataset-import-pipeline-handoff.md` | approved |
| Template Designer Builder Agent | `docs/tasks/13-template-designer-builder-agent.md` | complete | `docs/handoffs/2026-05-31-task13-template-designer-builder-handoff.md` | approved |
| Rich Text and Media Fields Agent | `docs/tasks/14-rich-media-fields-agent.md` | complete | `docs/handoffs/2026-05-31-task14-rich-media-fields-handoff.md` | approved |
| Dynamic Form Runtime Agent | `docs/tasks/15-dynamic-form-runtime-agent.md` | complete | `docs/handoffs/2026-05-31-task15-dynamic-form-runtime-handoff.md` | approved |
| LLM Field Loop Agent | `docs/tasks/16-llm-field-loop-agent.md` | complete | `docs/handoffs/2026-05-31-task16-llm-field-loop-handoff.md` | approved |
| Labeler Navigation Agent | `docs/tasks/17-labeler-navigation-agent.md` | drafted / not started | none | pending dispatch |
| Multistage Human Review Agent | `docs/tasks/18-multistage-human-review-agent.md` | drafted / not started | none | pending dispatch |
| Production Readiness Agent | `docs/tasks/19-production-readiness-agent.md` | drafted / not started | none | pending dispatch |

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
- Auth API contract for Task10: `POST /auth/login` and `GET /auth/me`.
- Frontend auth token storage key remains `labelhub.accessToken`.
- Task10 auth scope is JWT username/password MVP with explicit demo-user seeding and no self-registration.
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
- Task metadata contract: `instruction_rich_text`, backend-derived `instruction_plain_text`, normalized unique `tags`, metadata-only `reward_rule`, and `quality_rules` are returned through `TaskRead`.
- Reward rules remain policy metadata only; no payout execution, tax handling, ledger, or external payment provider integration exists in Task 11.
- Dataset import preview API is `POST /tasks/{task_id}/items/import/preview`.
- Dataset import preview formats are `json_array`, `jsonl`, and `xlsx`; default limits are 5,000 rows and 5 MiB unless overridden by `LABELHUB_IMPORT_MAX_ROWS` and `LABELHUB_IMPORT_MAX_FILE_BYTES`.
- Dataset import commit remains `POST /tasks/{task_id}/items/import`, is owner-only, and is all-or-nothing after backend validation.
- Task 13/14 template designer authoring supports Task03 MVP fields plus `rich_text`, `image_upload`, and `file_upload`; Task15 runtime supports `single`, `group`, and `tabs` layouts, visibility rules, typed validations, and server-approved custom validators.
- Task 13 frontend validation gates draft save/publish for backend max-length/range/reference parity, but backend template validation remains authoritative.
- Task 14 upload APIs are `POST /labeler/assignments/{assignment_id}/uploads` and `GET /uploads/{asset_id}/download`.
- Task 14 upload metadata is persisted in `upload_assets`; API responses expose public-safe metadata and relative download URLs, never local storage paths or stored filenames.
- Task 14 upload storage root defaults to `storage/uploads`, overrideable by `LABELHUB_UPLOAD_STORAGE_PATH`; local filesystem storage is MVP-only with manual cleanup.
- Task 14 rich-text answers are stored as safe structured markdown with backend-derived `plainText`; backend rejects unsafe markup patterns and does not trust client-provided fallback text.
- Task 14 upload validation enforces required/count/size/type/extension/asset-ownership constraints against the frozen template snapshot and submission context.
- Task 16 field-level LLM assist route is `POST /labeler/assignments/{assignment_id}/llm-assist` and is labeler-owned assignment scoped.
- Task 16 `llm_trigger` fields support `mode`, `outputSchema`, `contextFields`, and whitelisted `temperature`; model credentials remain server-side.
- Task 16 assist calls validate structured `{ value, rationale?, confidence? }` output against the configured output schema and target field before frontend writeback.
- Task 16 assist attempts persist `llm_field_assist_logs` and a submission audit event with prompt snapshot, model metadata, target field, status, and failure reason.

## Open Decisions

| Decision | Default | Needs User? | Status |
| --- | --- | --- | --- |
| LLM provider | OpenAI-compatible environment config | yes before live AI calls | open |
| Auth mode | JWT username/password MVP | no | defaulted |
| Login implementation scope | username/password JWT, explicit demo users, no self-registration | no | decided for Task10 |
| Deployment target | Docker Compose | no | defaulted |
| Database | PostgreSQL | no | defaulted |
| Label assignment mode | manual claim from marketplace | no | defaulted |
| AI auto-return behavior | allowed by thresholds | yes if product policy changes | defaulted |
| Data retention/privacy policy | not defined | yes before handling sensitive uploaded datasets | open |
| Template multi-tab/group layout | runtime supported by Task15; full authoring controls deferred | yes if full authoring controls are required for MVP | decided for runtime |
| Versioned template snapshot reads for assignments/submissions | implement in Task09 | no | decided: required for MVP |
| Reviewer detail AI metadata, human review comments, previous attempts, and AI score filters | implement in Task09 | no | decided: required for MVP |
| Rich task instruction storage | sanitized structured rich text plus plain-text fallback | yes if a specific editor/storage format is required | open |
| Reward policy | metadata-only rules, no payment execution | yes before payout or settlement behavior | defaulted |
| Dataset import limits/privacy | configurable row/file limits, no sensitive production data until policy exists | yes before production datasets | open |
| Upload storage and scanning | local MVP storage, no antivirus/DLP guarantee | yes before production file/image uploads | open |
| Dynamic custom validators | server-approved named validators only, no arbitrary code execution | yes before user-authored code validators | defaulted |
| Field-level LLM assist | server-side provider config, mocked/fallback behavior without credentials | yes before live provider calls | defaulted |
| Multistage review policy | initial review, re-review, final review | yes before staffing/escalation policy changes | open |
| Docker runtime validation | require Docker-enabled host for `docker compose up --build` evidence | yes if external handoff requires runtime proof | open |

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
| 08 QA Docs Deploy | QA Docs Deploy Agent | complete | first vertical slice, Task09 approved | Approved; docs, local E2E smoke, Docker config validation, deployment notes, demo script, known limitations, and handoff verified. |
| 10 Auth Login | Auth Login Agent | complete | Tasks 02, 06, 07, 08 | Approved; real JWT username/password login, persisted demo users, fail-closed bearer auth, route guards, logout, docs, OpenAPI, tests, migration, and login smoke verified. |
| 11 Task Metadata and Rewards | Task Metadata and Rewards Agent | complete | Tasks 02, 06, 10 | Approved; rich instructions, normalized tags, metadata-only reward rules, quality rules, owner UI, labeler read surfaces, OpenAPI, docs, migration, and validation regression tests verified. |
| 12 Dataset Import Pipeline | Dataset Import Pipeline Agent | complete | Tasks 02, 06, 10 | Approved; JSON array/JSONL/XLSX preview, row-level validation, batch editing, all-or-nothing commit, OpenAPI, docs, and tests verified. |
| 13 Template Designer Builder | Template Designer Builder Agent | complete | Tasks 03, 06 | Approved; drag/drop template builder, accessible reorder fallback, duplication/deletion, full MVP property inspector, frontend validation parity, preview, backend validation regression, handoff, and review fixes verified. |
| 14 Rich Text and Media Fields | Rich Text and Media Fields Agent | complete | Tasks 03, 06, preferably Task 13 | Approved; rich text, image/file upload schema support, authenticated upload/download routes, local MVP storage, renderer/designer controls, OpenAPI, docs, migration, and regression tests verified. |
| 15 Dynamic Form Runtime | Dynamic Form Runtime Agent | complete | Tasks 03, 13 | Approved; conditional visibility, linked validation, strict safe-regex subset, server-approved custom validators, group/tab layouts, OpenAPI, handoff, and regression tests verified. |
| 16 LLM Field Loop | LLM Field Loop Agent | complete | Tasks 03, 04, 15 | Approved; server-side assist route, structured output validation, audit logs, frontend suggest/prefill/confirm writeback, OpenAPI, docs, migration, and regression tests verified. |
| 17 Labeler Navigation | Labeler Navigation Agent | drafted / not started | Tasks 07, 09, 10 | Add previous/next/skip navigation with draft preservation and skip audit. |
| 18 Multistage Human Review | Multistage Human Review Agent | drafted / not started | Tasks 09, 10 | Add initial/re-review/final stages and round diff views while preserving WorkflowService authority. |
| 19 Production Readiness | Production Readiness Agent | drafted / not started | Tasks 08, 10, Task 16 for live field LLM checks | Verify or document Docker runtime and live-AI readiness without overstating support. |

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
- Task08 local E2E passes with backend/frontend/export-storage env aligned, and `README.md` plus `docs/deployment.md` now document the same `LABELHUB_EXPORT_STORAGE_PATH` for backend startup and Playwright helper commands.
- Full `docker compose up --build` runtime startup remains unverified by design; Task08 documents Docker deployment as config-validated only. Decide separately whether full Docker runtime validation is required before external handoff.
- Task10 approved real login; downstream work must preserve `labelhub.accessToken`, `/auth/login`, `/auth/me`, explicit demo-user seeding, and persisted-user bearer auth fail-closed behavior.
- Full Task08 happy-path E2E export enqueue still depends on Redis/Docker availability; Task10 login-specific Playwright smoke passed and this is not a Task10 blocker.
- Tasks 11-16 are approved expanded-scope features; do not declare expanded-scope readiness until remaining Tasks 17-19 each have a handoff and Supervisor approval.
- Task 11 reward rules are metadata-only unless the user explicitly approves real payment/payout behavior.
- Task 11 validation risk is resolved: non-string JSON values for text fields are rejected instead of being coerced with `str(value)`.
- Task 12 and Task 14 both introduce data/privacy exposure through larger imports or file uploads; production use requires retention and sensitive-data policy decisions.
- Task 13 approved with layout/visibility/runtime-rule authoring disabled; Task 15 approved renderer/backend runtime semantics, so any future authoring controls must preserve the same backend-authoritative validation and visibility behavior.
- Task 14 approved server-side upload/download with local MVP storage only; production object storage, scanning, retention, and sensitive-data policy remain open.
- Task 16 approved server-side field-level LLM assist; live calls still require provider credentials and sensitive-data retention/privacy policy before production use.
- Task 18 may touch `WorkflowService`; any stage/status change must be reviewed as a workflow contract change.
- Task 19 must not mark Docker runtime verified unless `docker compose up --build` actually runs on a Docker-enabled host.

## Latest Verification

- Task 16 handoff reviewed from `docs/handoffs/2026-05-31-task16-llm-field-loop-handoff.md`.
- Task 16 verification: `cd backend && ./.venv313/bin/pytest tests/test_llm_field_assist.py tests/test_ai_review_agent.py -q` passed, 15 tests, with existing passlib `crypt` deprecation warning.
- Task 16 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 108 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 16 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed and regenerated `frontend/src/api/openapi.json`.
- Task 16 verification: `python -m json.tool frontend/src/api/openapi.json` could not run because this host has no `python` executable on PATH; `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task16-openapi-json-review.json` passed.
- Task 16 verification: `cd frontend && npm test -- --run src/features/schema-renderer src/features/labeler` passed, 20 tests, with existing React Router future-flag warnings.
- Task 16 verification: `cd frontend && npm test -- --run` passed, 10 files and 71 tests, with existing React Router future-flag warnings.
- Task 16 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 16 verification: `git diff --check` passed.
- Task 16 migration smoke: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task16_review_migration.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260531_0006`.
- Task 15 handoff reviewed from `docs/handoffs/2026-05-31-task15-dynamic-form-runtime-handoff.md`.
- Task 15 review fixes resolved hidden retained source visibility and regex ReDoS risks by masking hidden source fields and constraining regex to a strict exact-repeat safe subset.
- Task 15 verification: direct backend probes confirmed the prior adjacent optional-repeat ReDoS shape is rejected, variable repeats are rejected, `^TICKET-[0-9]{3}$` remains accepted, and an exact-repeat safe pattern validates quickly.
- Task 15 verification: `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_submission_validation.py -q` passed, 22 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 15 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 103 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 15 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed and regenerated `frontend/src/api/openapi.json`.
- Task 15 verification: `python -m json.tool frontend/src/api/openapi.json` could not run because this host has no `python` executable on PATH; `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task15-final-review-openapi-json-check.json` passed.
- Task 15 verification: `cd frontend && npm test -- --run src/features/schema-renderer src/features/template` passed, 25 tests.
- Task 15 verification: `cd frontend && npm test -- --run` passed, 10 files and 66 tests, with existing React Router future-flag warnings.
- Task 15 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 15 verification: `git diff --check` passed.
- Task 14 handoff reviewed from `docs/handoffs/2026-05-31-task14-rich-media-fields-handoff.md`.
- Task 14 review found and re-review confirmed fixed P2 frontend/backend upload-list parity for the 20-entry MIME/extension caps.
- Task 14 verification: `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_uploads.py -q` passed, 14 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 14 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 91 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 14 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed and regenerated `frontend/src/api/openapi.json`.
- Task 14 verification: `python -m json.tool frontend/src/api/openapi.json` could not run because this host has no `python` executable on PATH; `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task14-update-openapi-python3.json` passed.
- Task 14 verification: `cd frontend && npm test -- --run src/features/template/TemplateDesigner.test.tsx` passed, 11 tests.
- Task 14 verification: `cd frontend && npm test -- --run src/features/schema-renderer src/features/template src/features/reviewer` passed, 3 files and 21 tests, with existing React Router future-flag warnings.
- Task 14 verification: `cd frontend && npm test -- --run` passed, 10 files and 55 tests, with existing React Router future-flag warnings.
- Task 14 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 14 verification: `git diff --check` passed.
- Task 14 migration smoke: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task14_update_review.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260531_0005`.
- Task 13 handoff reviewed from `docs/handoffs/2026-05-31-task13-template-designer-builder-handoff.md`.
- Task 13 review fixes resolved P2 client validation parity and P3 arbitrary canvas-drop reorder.
- Task 13 verification: `cd frontend && npm test -- --run src/features/template/TemplateDesigner.test.tsx` passed, 9 tests.
- Task 13 verification: `cd frontend && npm test -- --run src/features/template src/features/schema-renderer` passed, 2 files and 11 tests.
- Task 13 verification: `cd frontend && npm test -- --run` passed, 10 files and 51 tests, with existing React Router future-flag warnings.
- Task 13 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 13 verification: `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py -q` passed, 6 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 13 verification: `git diff --check` passed.
- 2026-05-31 Supervisor gap triage reviewed the reported uncovered requirements and mapped them to Tasks 11-19 in `docs/reviews/2026-05-31-supervisor-follow-up-gap-review.md`.
- 2026-05-31 task docs drafted: `docs/tasks/11-task-metadata-rewards-agent.md` through `docs/tasks/19-production-readiness-agent.md`.
- 2026-05-31 docs-only update completed; no backend/frontend tests were run for this triage because no feature code changed.
- 2026-05-31 verification: `git diff --check` passed.
- Task 11 handoff reviewed from `docs/handoffs/2026-05-31-task11-task-metadata-rewards-handoff.md`.
- Task 11 verification: `cd backend && ./.venv313/bin/pytest tests/test_tasks.py -q` passed, 7 tests, 1 passlib `crypt` deprecation warning.
- Task 11 verification: `cd frontend && npm test -- --run src/features/owner/OwnerConsole.test.tsx src/features/labeler/LabelerWorkspace.test.tsx` passed, 2 files and 15 tests, with existing React Router future-flag warnings.
- Task 11 verification: `git diff --check` passed.
- Task 11 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 67 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 11 verification: `cd frontend && npm test -- --run` passed, 9 files and 39 tests, with existing React Router future-flag warnings.
- Task 11 verification: `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task11-review-openapi.json` passed.
- Task 11 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 11 verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task11_supervisor_review.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260531_0004`.
- Task 11 review note written to `docs/reviews/2026-05-31-task11-task-metadata-rewards-review.md`.
- Task 11 final handoff re-reviewed from `docs/handoffs/2026-05-31-task11-task-metadata-rewards-handoff.md`.
- Task 11 final verification: direct `TaskCreate`/`RewardRule` regression probe passed; non-string text values are rejected.
- Task 11 final verification: `cd backend && ./.venv313/bin/pytest tests/test_tasks.py -q` passed, 13 tests, 1 passlib `crypt` deprecation warning.
- Task 11 final verification: `git diff --check` passed.
- Task 11 final verification: `cd backend && ./.venv313/bin/pytest -q` passed, 73 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 11 final verification: `cd frontend && npm test -- --run` passed, 9 files and 39 tests, with existing React Router future-flag warnings.
- Task 11 final verification: `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task11-rereview-openapi.json` passed.
- Task 11 final verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 11 final verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task11_rereview.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260531_0004`.
- Task 11 final approval note written to `docs/reviews/2026-05-31-task11-task-metadata-rewards-final-review.md`.
- Task 12 handoff reviewed from `docs/handoffs/2026-05-31-task12-dataset-import-pipeline-handoff.md`.
- Task 12 verification: `cd backend && ./.venv313/bin/pytest tests/test_tasks.py tests/test_dataset_import.py -q` passed, 22 tests, 1 passlib `crypt` deprecation warning.
- Task 12 verification: `cd frontend && npm test -- --run src/features/owner` passed, 3 files and 12 tests.
- Task 12 verification: `git diff --check` passed.
- Task 12 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 82 tests, with existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- Task 12 verification: `cd frontend && npm test -- --run` passed, 10 files and 42 tests, with existing React Router future-flag warnings.
- Task 12 verification: `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task12-review-openapi.json` passed.
- Task 12 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 12 verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task12_supervisor_review.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260531_0004`.
- Task 12 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed.
- Task 12 verification: `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task12-review-openapi-after-export.json` passed.
- Task 12 approval note written to `docs/reviews/2026-05-31-task12-dataset-import-pipeline-review.md`.
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
- Task 08 handoff reviewed from `docs/handoffs/2026-05-24-task08-qa-docs-deploy-handoff.md`.
- Task 08 verification: handoff required sections were found with `rg`.
- Task 08 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 40 tests, 1 existing Pydantic alias warning.
- Task 08 verification: `cd frontend && npm test -- --run` passed, 7 files and 22 tests, with React Router future-flag warnings.
- Task 08 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 08 verification: `docker compose config` passed and includes `api`, `frontend`, `worker`, `postgres`, and `redis`.
- Task 08 verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 08 verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_supervisor.sqlite ./.venv313/bin/alembic upgrade head` passed, through `20260524_0002`.
- Task 08 verification: local backend/frontend startup passed after port-binding escalation.
- Task 08 verification: `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_supervisor.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_supervisor_exports BACKEND_URL=http://127.0.0.1:18000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e` passed, 1 Playwright test.
- Task 08 verification: `git diff --check` passed.
- Task 08 review note written to `docs/reviews/2026-05-25-task08-qa-docs-deploy-review.md`.
- Task 08 review-fix handoff reviewed from `docs/handoffs/2026-05-25-task08-qa-docs-deploy-handoff.md`.
- Task 08 final verification: `cd backend && ./.venv313/bin/pytest -q` passed, 40 tests, 1 existing Pydantic alias warning.
- Task 08 final verification: `cd frontend && npm test -- --run` passed, 7 files and 22 tests, with React Router future-flag warnings.
- Task 08 final verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 08 final verification: `docker compose config` passed and includes `api`, `frontend`, `worker`, `postgres`, and `redis`.
- Task 08 final verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 08 final verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_final_review.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_final_review_exports ./.venv313/bin/alembic upgrade head` passed, through `20260524_0002`.
- Task 08 final verification: documented local backend/frontend startup passed after port-binding escalation.
- Task 08 final verification: `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task08_final_review.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task08_final_review_exports BACKEND_URL=http://127.0.0.1:8000 FRONTEND_URL=http://127.0.0.1:5173 npm run e2e` passed, 1 Playwright test.
- Task 08 final verification: `git diff --check` passed.
- Task 08 final approval note written to `docs/reviews/2026-05-25-task08-qa-docs-deploy-final-review.md`.
- Task 10 task file written to `docs/tasks/10-auth-login-agent.md`.
- Agent coordination updated to add Auth Login Agent after Task08 when the placeholder login limitation must be closed before final integration review.
- Agent prompts updated with Prompt 10 for the Auth Login Agent.
- Task 10 handoff reviewed from `docs/handoffs/2026-05-28-task10-auth-login-handoff.md`.
- Task 10 verification: `cd backend && ./.venv313/bin/pytest -q` passed, 46 tests, 1 existing Pydantic alias warning.
- Task 10 verification: `cd backend && ./.venv313/bin/python scripts/export_openapi.py` passed.
- Task 10 verification: `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task10-supervisor.json` passed.
- Task 10 verification: `cd frontend && npm test -- --run` passed, 7 files and 25 tests, with existing React Router future-flag warnings.
- Task 10 verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 10 verification: `docker compose config >/tmp/labelhub-compose-task10-supervisor.yaml` passed.
- Task 10 verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_supervisor.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260528_0003`.
- Task 10 verification: login-specific Playwright smoke passed against local backend/frontend using `e2e/auth-login.spec.ts --project=chromium`.
- Task 10 verification: `git diff --check` passed.
- Task 10 review note written to `docs/reviews/2026-05-29-task10-auth-login-review.md`.
- Task 10 revision cleanup confirmed: no `.gitignore` diff, no `.understand-anything/`, and no `frontend/test-results/` artifacts remain.
- Task 10 final verification: `git diff --check` passed.
- Task 10 final verification: `cd backend && ./.venv313/bin/pytest -q` passed, 46 tests, 1 existing Pydantic alias warning.
- Task 10 final verification: `python -m json.tool frontend/src/api/openapi.json` passed.
- Task 10 final verification: `cd frontend && npm test -- --run` passed, 7 files and 25 tests, with existing React Router future-flag warnings.
- Task 10 final verification: `cd frontend && npm run build` passed, with existing Vite chunk-size warning.
- Task 10 final verification: `docker compose config` passed.
- Task 10 final verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_revise_review.sqlite ./.venv313/bin/alembic upgrade head` passed through `20260528_0003`.
- Task 10 final verification: `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_revise_e2e.sqlite ./.venv313/bin/python scripts/seed_e2e_data.py demo-users` passed.
- Task 10 final verification: `cd frontend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task10_revise_e2e.sqlite LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_task10_revise_e2e_exports BACKEND_URL=http://127.0.0.1:18010 FRONTEND_URL=http://127.0.0.1:5173 npx playwright test e2e/auth-login.spec.ts --project=chromium` passed, 1 Chromium login smoke.
- Task 10 final approval note written to `docs/reviews/2026-05-29-task10-auth-login-final-review.md`.

## Next Recommended Action

Dispatch Task 16 LLM Field Loop Agent if closing the `llm_trigger` server-side model loop is the next priority.
