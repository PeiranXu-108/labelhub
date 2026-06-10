## Agent Handoff

Agent: Owner Task Operations Agent
Task file: docs/tasks/21-owner-task-operations-agent.md
Status: ready for review

Changed files:
- backend/app/api/routes/tasks.py
- backend/app/schemas/task.py
- backend/app/services/tasks.py
- backend/tests/test_tasks_api.py
- frontend/src/api/openapi.json
- frontend/src/features/owner/OwnerConsole.test.tsx
- frontend/src/features/owner/OwnerTaskList.tsx
- frontend/src/features/owner/TaskDashboard.tsx
- frontend/src/features/owner/TaskDrawer.tsx
- frontend/src/features/owner/api.ts
- frontend/src/features/owner/types.ts
- frontend/src/routes/owner/OwnerTaskDetailRoute.tsx
- frontend/src/styles.css
- docs/status-board.md
- docs/handoffs/2026-06-08-task21-owner-task-operations-handoff.md

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_tasks_api.py tests/test_tasks.py -q`: pass, 23 tests; existing passlib `crypt` deprecation warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 126 tests; existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python3 -m json.tool frontend/src/api/openapi.json`: pass.
- `cd frontend && npm test -- --run src/features/owner`: pass, 16 tests.
- `cd frontend && npm test -- --run`: pass, 79 tests; existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass; existing Vite chunk-size warning.
- `git diff --check`: pass.

Contract changes:
- `GET /tasks` now accepts optional `search`, `status`, and `distribution_strategy` query params.
- `GET /tasks/metrics` returns filtered task-list summary metrics plus per-task progress rows.
- `GET /tasks/{task_id}/metrics` returns one task's progress, submission status counts, and latest AI decision counts.
- `distribution_strategy` is now constrained to `manual` or `auto_claim` in `POST /tasks`, `PATCH /tasks/{task_id}`, and task-list query filters.
- `PATCH /tasks/{task_id}` now accepts valid `distribution_strategy` so edit flow preserves distribution metadata.
- OpenAPI snapshot regenerated.

Blockers:
- Browser visual QA was attempted with the Browser plugin, but the in-app browser binding `iab` was unavailable from the plugin runtime. Automated frontend tests and build passed; no Browser screenshot evidence was produced.

Requests for Supervisor:
- Review the metric definitions below, especially whether task-list summary counts should remain filter-scoped or become global owner-scope counters.

Final owner task list filters and search behavior:
- Search is case-insensitive partial matching across task ID, task name, description, plain instruction text, and tags.
- Status filter supports `draft`, `published`, `paused`, and `ended`.
- Distribution filter supports `manual` and `auto_claim`.
- The task table and `/tasks/metrics` call use the same active filters, so summary cards and row progress match the displayed result set.

Metric definitions:
- `published_task_count`, `draft_task_count`, `total_task_count`: server-backed counts over the active filtered task set.
- `item_count`: server-backed `TaskItem` count.
- `submitted_count`: server-backed count of submissions whose current status is one of `submitted`, `ai_reviewing`, `ai_passed`, `needs_human_review`, `human_reviewing`, `approved`, or `exportable`, and that have non-null `submitted_at`.
- `current_week_submitted_count`: server-backed count using the same current-status set as `submitted_count`, additionally requiring `submitted_at >= Monday 00:00 UTC` for the current week.
- `progress_percent`: server-backed `round(submitted_count / item_count * 100)`, or `0` when `item_count` is zero.
- `average_progress_percent`: server-backed arithmetic mean of filtered tasks' `progress_percent`, or `0` with no tasks.
- `submission_status_counts`: server-backed submission count grouped by persisted submission status.
- `ai_decision_counts`: server-backed latest `AIReview` decision per submission, grouped by decision.
- Task detail item-status and export-status tables remain locally derived from already loaded `items` and `exports`; they do not depend on submission or AI review state.

Final task create/publish flow:
- Drawer supports title/name, description, instructions, labels/tags, quality rules, reward metadata, quota, deadline, and distribution strategy.
- Drawer exposes `保存草稿` / `保存修改` and `创建并配置` / `保存并进入配置`.
- Continue actions save through the normal create/update API, then navigate to the task detail setup workflow.
- Publishing remains on the task detail page and still calls `POST /tasks/{task_id}/publish` through `transitionTask`; publish blockers remain visible when imported items or a published template are missing.
- No publish blocker or `WorkflowService` transition was bypassed.

Disabled/deferred controls and dependencies:
- Template selection is disabled in the drawer and hands off to the task detail template tab; advanced template authoring remains Task22 scope.
- AI pre-review is shown as a disabled enabled-state summary; thresholds/model config remain in review configuration, and task-level AI enable/disable needs a backend contract before becoming interactive.

UI consistency notes:
- Kept the existing Studio/Ant Design system: `StudioPageHeader`, `StudioPanel`, `MetricStrip`, `StatusPill`, Ant table, search input, selects, progress, and drawer.
- Added only scoped owner toolbar/progress CSS; no app shell, theme, or page composition redesign.
- Existing unrelated working-tree modification remains in `frontend/src/features/labeler/LabelerMarketplace.tsx`; this task did not edit it.
