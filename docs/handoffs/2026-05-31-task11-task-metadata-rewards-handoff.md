## Agent Handoff

Agent: Task Metadata and Rewards Agent
Task file: docs/tasks/11-task-metadata-rewards-agent.md
Status: ready for re-review

Changed files:
- backend/app/api/routes/tasks.py
- backend/app/models/__init__.py
- backend/app/schemas/task.py
- backend/app/services/tasks.py
- backend/alembic/versions/20260531_0004_task_metadata_rewards.py
- backend/tests/test_tasks.py
- docs/api.md
- docs/demo-script.md
- docs/known-limitations.md
- docs/handoffs/2026-05-31-task11-task-metadata-rewards-handoff.md
- frontend/src/api/openapi.json
- frontend/src/features/auth/http.ts
- frontend/src/features/labeler/LabelerMarketplace.tsx
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/labeler/LabelerWorkspace.test.tsx
- frontend/src/features/owner/OwnerConsole.test.tsx
- frontend/src/features/owner/OwnerTaskList.tsx
- frontend/src/features/owner/TaskDashboard.tsx
- frontend/src/features/owner/TaskDrawer.tsx
- frontend/src/features/owner/types.ts
- frontend/src/features/task-metadata/TaskMetadataPanel.tsx
- frontend/src/styles.css

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_tasks.py -q`: pass, 13 tests, 1 passlib crypt deprecation warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 73 tests, existing passlib crypt deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python -m json.tool frontend/src/api/openapi.json`: not run successfully because this shell has no `python` binary (`zsh:1: command not found: python`).
- `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task11-openapi-python3.json`: pass.
- `cd frontend && npm test -- --run`: pass, 9 files and 39 tests, with existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `git diff --check`: pass.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task11_metadata_v2.sqlite ./.venv313/bin/alembic upgrade head`: pass through revision `20260531_0004`.
- Review revision red/green: added regression tests for non-string create/update `description`, non-string create/update `instruction_plain_text`, and non-string reward-rule `description`; they failed before the validator fix and pass after it.

Contract changes:
- `TaskCreate` now accepts `instruction_rich_text`, `instruction_plain_text`, `tags`, `reward_rule`, and `quality_rules` alongside the existing task basics.
- `TaskUpdate` accepts the same metadata fields except `distribution_strategy`, preserving the existing update scope.
- `TaskRead` returns all metadata fields through owner, reviewer, labeler marketplace, and labeler assignment task read surfaces.
- `instruction_rich_text` shape: `{ "format": "markdown", "content": string }` or `null`.
- `instruction_plain_text` shape: `string | null`; when rich text is present, backend derives this fallback and does not trust the frontend copy.
- `tags` shape: `string[]`, always normalized and unique.
- `reward_rule` shape: `{ "mode": "none" | "fixed_per_accepted_submission" | "manual", "currency": string | null, "amount": decimal-string | null, "description": string | null }`.
- `quality_rules` shape: `{ "label": string, "description": string }[]`.
- Migration name: `20260531_0004_task_metadata_rewards.py`; adds nullable instruction columns and JSON-backed tags, reward rule, and quality rules with backfill defaults of `[]` and `{ "mode": "none", "currency": null, "amount": null, "description": null }`.
- Rich-text policy: safe structured markdown only. Backend rejects raw HTML tags, JavaScript URLs, HTML data URLs, and inline event-handler patterns. Frontend displays derived plain text, not executable HTML.
- Tag normalization: trim, collapse internal whitespace, `casefold()` to lower-case, reject empty values, reject duplicates after normalization.
- Reward-rule validation: `none` forbids currency/amount; `manual` requires currency and forbids amount; `fixed_per_accepted_submission` requires ISO currency and positive amount. Currency is upper-cased. Reward rules are metadata only; no payment execution, payout ledger, settlement, tax handling, or external payment integration was added.
- Text-field validation: `description`, `instruction_plain_text`, and reward-rule `description` preserve trim/blank-to-null behavior for strings and reject non-string JSON values with `422`.
- OpenAPI regenerated and includes `InstructionRichText`, `QualityRule`, and reward-rule input/output schemas.

Blockers:
- none

Requests for Supervisor:
- Review Task11 metadata contract and UX surfaces.
- Confirm whether any future production marketplace payout/settlement policy should become a separate approved task; it is intentionally out of scope here.
