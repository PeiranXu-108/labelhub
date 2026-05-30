# 2026-05-31 Task 11 Task Metadata and Rewards Review

## Supervisor Feedback

Agent: Task Metadata and Rewards Agent
Decision: needs changes

What is good:
- Task metadata scope is implemented in the expected ownership area: task schemas/service/routes, migration, owner edit UI, labeler read surfaces, OpenAPI, docs, and focused tests.
- Reward rules remain metadata-only; no payout ledger, settlement, tax, or external payment behavior was introduced.
- Rich instructions are displayed through backend-derived plain text rather than executable HTML.
- Task update now routes through `TaskService` and records update audit logs.

Required changes:
- Fix backend text-field validation in `backend/app/schemas/task.py`. `normalize_plain_text(...)`, `TaskCreate.normalize_optional_text(...)`, `TaskUpdate.normalize_optional_text(...)`, and `RewardRule.normalize_description(...)` currently coerce non-string JSON values into strings via `str(value)`. This accepts invalid payloads such as `{"description": {"bad": "type"}}`, `{"instruction_plain_text": ["not", "text"]}`, and `{"reward_rule": {"mode": "manual", "currency": "usd", "description": {"bad": "type"}}}` instead of returning `422`. Preserve trimming/blank-to-null behavior for strings, but reject non-string values. Add regression tests for create/update description, instruction plain text, and reward description.

Verification:
- `cd backend && ./.venv313/bin/pytest tests/test_tasks.py -q`: pass, 7 tests, 1 passlib `crypt` deprecation warning.
- `cd frontend && npm test -- --run src/features/owner/OwnerConsole.test.tsx src/features/labeler/LabelerWorkspace.test.tsx`: pass, 2 files and 15 tests, existing React Router future-flag warnings.
- `git diff --check`: pass.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 67 tests, existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd frontend && npm test -- --run`: pass, 9 files and 39 tests, existing React Router future-flag warnings.
- `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task11-review-openapi.json`: pass.
- `cd frontend && npm run build`: pass, existing Vite chunk-size warning.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task11_supervisor_review.sqlite ./.venv313/bin/alembic upgrade head`: pass through `20260531_0004`.

Status board update:
- Task 11 marked needs changes.
- Latest verification updated with the Task 11 review results and validation blocker.

Next step:
- Return to the Task Metadata and Rewards Agent to fix text-field type validation and add regression tests, then request re-review.

