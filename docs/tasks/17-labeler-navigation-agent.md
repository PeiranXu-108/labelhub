# Task 17: Labeler Navigation Agent

## Mission

Add efficient annotation workbench navigation: previous item, next item, and skip/jump behavior for labelers working through a task queue.

This task owns assignment navigation ergonomics and the backend contracts needed to move through claimed or claimable work without losing drafts.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/17-labeler-navigation-agent.md`
- Current labeler workbench in `frontend/src/features/labeler/LabelerWorkbench.tsx`
- Current labeler API in `backend/app/api/routes/labeler.py`
- Current submission service in `backend/app/services/submissions.py`

## Dependencies

- Task 07 labeler/reviewer frontend is approved.
- Task 09 review integration contracts are approved.
- Task 10 auth login is approved.

## Owned Areas

- `backend/app/api/routes/labeler.py`
- `backend/app/services/submissions.py`
- `backend/app/schemas/labeler.py`
- Backend tests for assignment navigation and skip permissions.
- `frontend/src/features/labeler/LabelerWorkbench.tsx`
- `frontend/src/features/labeler/api.ts`
- `frontend/src/features/labeler/types.ts`
- Labeler route tests.
- Generated `frontend/src/api/openapi.json` only via backend OpenAPI export.
- `docs/handoffs/<date>-task17-labeler-navigation-handoff.md`

## Non-Owned Areas

- Reviewer queue behavior.
- AI review graph behavior.
- Export behavior.
- Task distribution policy beyond the navigation endpoints below.

## Product Decisions Frozen For This Task

- Navigation must preserve unsaved draft changes or ask for confirmation before leaving.
- Skip must be audited.
- Skip must not submit an annotation.
- Skip should release or mark the current assignment according to a documented backend policy; it must not directly edit submission workflow status outside `WorkflowService` if a status transition is involved.

If skip needs penalty/reward impact, stop and request Supervisor/user approval because that belongs with Task 11 reward policy.

## Required Backend Contract

Add or expand labeler endpoints to support:

- read current assignment position within a task or labeler queue.
- get previous assignment for the same labeler/task when available.
- get next assignment for the same labeler/task when available, claiming a new item only when the policy says it is safe.
- skip current assignment with a required or optional reason according to the final policy.

Responses should include enough data for the workbench to navigate without fetching a mutable current template instead of the frozen assignment template.

## Required Frontend Behavior

- Workbench shows previous, next, and skip controls.
- Controls expose disabled states when no target exists.
- Unsaved draft changes trigger autosave or confirmation before navigation.
- Skip action asks for confirmation and optional reason if backend supports it.
- Successful navigation routes to the target assignment and loads its frozen template snapshot.
- Keyboard shortcuts are optional and must be documented in handoff if added.

## Implementation Steps

- [ ] Define backend navigation/skip response schemas.
- [ ] Implement previous/next/skip service methods with permission checks.
- [ ] Add audit logging for skip.
- [ ] Add backend tests for previous, next, skip, no-next, and cross-labeler denial.
- [ ] Update frontend labeler API/types for navigation contracts.
- [ ] Add workbench navigation controls and unsaved-change protection.
- [ ] Add frontend tests for previous/next disabled states, navigation, skip confirmation, and draft preservation.
- [ ] Regenerate OpenAPI if backend contracts changed.
- [ ] Create the standard handoff.

## Required Tests

- Previous button navigates to a prior assignment owned by the labeler.
- Next button navigates to the next owned or safely claimable assignment.
- Next is disabled or returns a clear empty state when no work remains.
- Skip is audited and does not submit answers.
- Labeler cannot navigate to another labeler's assignment.
- Unsaved draft changes are saved or confirmed before navigation.
- Workbench continues to render from frozen assignment template snapshots.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_labeler_navigation.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/labeler
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

If `tests/test_labeler_navigation.py` does not exist yet, create it for navigation-specific backend coverage.

## Handoff Requirements

Create `docs/handoffs/<date>-task17-labeler-navigation-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Navigation endpoint route list and response shapes.
- Skip policy and audit behavior.
- Draft preservation behavior.
- No-work-left behavior.
- OpenAPI regeneration result.
- Backend/frontend tests and build results.
- Any reward/penalty decision deferred to Task 11 or the user.

