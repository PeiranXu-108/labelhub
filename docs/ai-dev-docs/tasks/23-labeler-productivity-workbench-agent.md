# Task 23: Labeler Productivity Workbench Agent

## Mission

Add the missing labeler productivity features from the product screenshots: assignment navigation list, progress context, contribution summary, submission history, report-problem flow, and keyboard shortcut support.

This task should enrich the existing labeler workbench without changing the app shell, theme, or core form runtime.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/23-labeler-productivity-workbench-agent.md`
- `docs/tasks/17-labeler-navigation-agent.md`
- `frontend/src/features/labeler/LabelerWorkbench.tsx`
- `frontend/src/features/labeler/LabelerMarketplace.tsx`
- `frontend/src/features/labeler/api.ts`
- `frontend/src/features/labeler/types.ts`
- `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- `backend/app/api/routes/labeler.py`
- `backend/app/services/submissions.py`
- `backend/app/schemas/labeler.py`

## Dependencies

- Task 17 is complete.
- Task 23 must not run in parallel with another task editing labeler assignment navigation contracts.

## Owned Areas

- Labeler workbench productivity panels and controls.
- Labeler assignment-list and contribution-summary backend read contracts if needed.
- Report-problem API and audit/event records if needed.
- Focused labeler frontend/backend tests.
- OpenAPI snapshot if contracts change.
- `docs/handoffs/<date>-task23-labeler-productivity-workbench-handoff.md`

## Non-Owned Areas

- SchemaRenderer field semantics and validation rules.
- Template authoring.
- AI review decision behavior.
- Reviewer queue operations.
- Reward payout execution.

## Required Functional Scope

### Assignment Navigation List

- Add a left-side or otherwise coherent task-question navigation panel for the current assignment context.
- Show current position, total known items, and per-item status where the backend can safely expose it.
- Support clicking a navigable assignment when the backend confirms the labeler owns or may claim it.
- Avoid exposing another labeler's assignments or private submission status.

### Progress and Contribution Summary

- Show current-task progress and labeler contribution counts:
  - submitted
  - approved/passed
  - returned/rejected
  - draft/in-progress where available
- Counts must be backend-backed if they span more than the current assignment.

### Submission History

- Show current assignment history:
  - draft saved
  - submitted
  - AI decision summary
  - reviewer return/revision events
- Use persisted audit/workflow/human-review data. Do not fabricate timeline events in the frontend.

### Report Problem Flow

- Add a report-problem action for the current assignment/item.
- Persist the report or audit event server-side with:
  - assignment ID
  - task item ID
  - labeler ID
  - reason/category
  - free-text note
  - timestamp
- Reporting a problem must not submit the annotation or change workflow status unless the user explicitly chooses skip.

### Keyboard Shortcuts

- Add shortcuts for submit, save draft, previous, next, and report problem where they do not conflict with typing in form fields.
- Shortcuts should be discoverable in an existing side panel or compact help area.
- Shortcuts must call the same functions as the visible buttons.

## Implementation Steps

- [ ] Define labeler navigation-list and contribution-summary contracts.
- [ ] Add backend tests for scoped navigation/contribution data and report-problem permissions.
- [ ] Implement backend read/report endpoints and schemas.
- [ ] Regenerate OpenAPI if endpoints are added.
- [ ] Add typed API functions in `frontend/src/features/labeler/api.ts`.
- [ ] Update `LabelerWorkbench` with navigation list, contribution summary, history panel, report action, and shortcuts using existing panel styling.
- [ ] Add frontend tests for visible controls and shortcut behavior.
- [ ] Update handoff with final contracts and privacy boundaries.

## Required Tests

- Backend tests for:
  - labeler cannot see another labeler's assignment navigation details
  - contribution counts are scoped to the authenticated labeler
  - report-problem persists without submitting or changing workflow status
- Frontend tests for:
  - navigation list renders current assignment and status
  - report-problem modal posts the expected payload
  - keyboard shortcuts do not fire while typing in inputs
  - current previous/next/skip/submit behavior remains intact

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_labeler_navigation.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python3 -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/labeler
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

## Handoff Requirements

Create `docs/handoffs/<date>-task23-labeler-productivity-workbench-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- assignment navigation data shape and privacy policy
- contribution-summary metric definitions
- report-problem route and persistence behavior
- keyboard shortcut list and conflict prevention
- UI consistency notes confirming the existing workbench layout remains coherent
