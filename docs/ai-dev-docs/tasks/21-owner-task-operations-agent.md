# Task 21: Owner Task Operations Agent

## Mission

Close the owner task-management gaps found in the 2026-06-08 Supervisor audit so the owner console matches the required operational workflow shown in the product screenshots.

This task focuses on functional completeness inside the existing Studio/Ant Design visual language. It must not redesign the application shell, theme, or page composition beyond the controls required for the missing workflow.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/21-owner-task-operations-agent.md`
- `frontend/src/features/owner/OwnerTaskList.tsx`
- `frontend/src/features/owner/TaskDrawer.tsx`
- `frontend/src/features/owner/TaskDashboard.tsx`
- `frontend/src/routes/owner/OwnerTaskDetailRoute.tsx`
- `frontend/src/features/owner/api.ts`
- `backend/app/api/routes/tasks.py`
- `backend/app/services/tasks.py`
- `backend/app/services/agent_workflow.py`
- `backend/app/schemas/task.py`

## Dependencies

- Tasks 01-20 are complete.
- Task 21 may run before Tasks 22-26, but it must coordinate if another task is actively editing `frontend/src/features/owner/` or task aggregate API contracts.

## Owned Areas

- Owner task list and task detail operational controls.
- Owner task create/edit/publish form flow.
- Backend task-list and task-dashboard aggregate read contracts if needed.
- Owner-focused frontend tests and backend API tests for new aggregate/filter contracts.
- OpenAPI snapshot only if backend contracts change.
- `docs/handoffs/<date>-task21-owner-task-operations-handoff.md`

## Non-Owned Areas

- Template field authoring internals owned by Task 22.
- Dataset import parser behavior owned by Task 12 unless this task only displays imported counts.
- AI pre-review operations queue owned by Task 24.
- Human reviewer decision workflows owned by Task 25.
- Production identity/storage/live-AI policy owned by Task 26.

## Required Functional Scope

### Owner Task List

- Add owner-side search by task name, task ID, and owner-visible metadata.
- Add filters for task status and distribution strategy.
- Replace the hardcoded `0%` progress value with backend-backed or accurately derived progress data.
- Add summary metrics matching the product intent:
  - published task count
  - draft task count
  - current-week submitted count
  - any other count must be clearly derived from backend data, not fabricated in the client
- Preserve dense operational layout. Use existing `StudioPageHeader`, `StudioPanel`, `MetricStrip`, `StatusPill`, Ant Design table/filter controls, and current spacing conventions.

### Task Create / Publish Flow

- Extend the task drawer or equivalent owner flow with:
  - task title
  - labels/tags
  - reward rule metadata
  - quota
  - deadline
  - distribution strategy
  - linked template selection or clear handoff into the template tab
  - AI pre-review enablement/config summary if the backend has the contract; otherwise show a disabled state with a Supervisor-noted backend dependency
- Provide explicit save-draft and publish/continue actions where possible.
- Do not bypass backend publish blockers. If data items or a published template are missing, keep the blocker visible and actionable.

### Owner Dashboard Aggregates

- Add a dedicated aggregate endpoint if deriving metrics from scattered lists is inaccurate or too expensive.
- Submission counts, AI decision counts, current-week submitted counts, and task progress must be computed server-side when they depend on submission/review state.
- Keep the existing task detail tabs and page structure coherent; new metrics should fit inside the current dashboard pattern.

## Implementation Steps

- [ ] Define the owner metrics contract and whether it is per-task, task-list-wide, or both.
- [ ] Add backend tests for task-list filters and aggregate counts before changing API behavior.
- [ ] Add or extend backend routes/services/schemas for owner task metrics and filters.
- [ ] Regenerate `frontend/src/api/openapi.json` if the API contract changes.
- [ ] Update `frontend/src/features/owner/api.ts` with typed calls for the new contract.
- [ ] Update `OwnerTaskList` with search/filter controls, real progress, and summary metrics.
- [ ] Update `TaskDrawer` or task detail actions with the missing create/publish workflow fields while preserving the current visual system.
- [ ] Update focused frontend tests for filters, metrics, and publish blockers.
- [ ] Update docs/handoff with final API shapes, derived metric definitions, and any intentionally deferred controls.

## Required Tests

- Backend tests for:
  - filtering by status
  - filtering by distribution strategy
  - search by task name or ID
  - task progress and current-week submission aggregate accuracy
- Frontend tests for:
  - owner search/filter controls call the correct API or derive from loaded data intentionally
  - progress is not hardcoded
  - create/edit payload preserves existing task metadata
  - publish blockers remain visible

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_tasks_api.py tests/test_tasks.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python3 -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/owner
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

## Handoff Requirements

Create `docs/handoffs/<date>-task21-owner-task-operations-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- final owner task list filters and search behavior
- exact metric definitions and whether each metric is server-backed or locally derived
- final task create/publish flow
- any disabled/deferred controls and their backend dependency
- UI consistency notes confirming no theme/layout redesign was introduced
