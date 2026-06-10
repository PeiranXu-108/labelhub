# Task 25: Human Review Operations Agent

## Mission

Close the reviewer operations gaps from the product screenshots: reviewer productivity metrics, SLA context, assignment/ownership controls, direct revision path where policy allows, audit-log export, and clearer final decision actions.

This task should refine the existing review queue and detail surfaces without changing the core visual system or bypassing backend workflow rules.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/25-human-review-operations-agent.md`
- `docs/tasks/18-multistage-human-review-agent.md`
- `frontend/src/features/reviewer/ReviewQueue.tsx`
- `frontend/src/features/reviewer/ReviewSubmissionDetail.tsx`
- `frontend/src/features/reviewer/api.ts`
- `frontend/src/features/reviewer/types.ts`
- `backend/app/api/routes/review.py`
- `backend/app/services/submissions.py`
- `backend/app/services/review_stages.py`
- `backend/app/schemas/review.py`
- `backend/app/services/workflow.py`

## Dependencies

- Task 18 is complete.
- Task 25 must not run in parallel with Task 24 if both are editing reviewer routes/types.

## Owned Areas

- Human reviewer queue and detail operations.
- Reviewer productivity metrics and SLA read contracts.
- Review assignment/claiming controls if product policy remains bounded to reviewer workflow.
- Audit-log export for review decisions.
- Focused backend/frontend tests.
- OpenAPI snapshot if contracts change.
- `docs/handoffs/<date>-task25-human-review-operations-handoff.md`

## Non-Owned Areas

- AI review decision logic and retry queue.
- Labeler report-problem flow.
- Production staffing and escalation policy beyond MVP fields.
- Payment/reward execution.

## Required Functional Scope

### Reviewer Metrics

- Add reviewer-visible metrics:
  - reviewed today
  - pass rate
  - pending review count
  - SLA remaining or SLA overdue where deadline data exists
- Metrics must be backend-backed when they depend on reviewer identity, decision history, or submission timestamps.

### Queue Operations

- Preserve current filters and batch approve/return behavior.
- Add reviewer assignment/claim controls only if backed by a clear backend contract.
- Add "assign to" or "self-claim" behavior with audit logs if assignment is implemented.
- Do not expose broad user-management controls; this is review-operations scope only.

### Detail Decision Actions

- Keep approve and return actions stage-aware.
- Add direct revision path only if product policy is explicit in the task implementation:
  - reviewer-authored changes must be separately audited
  - original labeler payload must remain recoverable
  - workflow status changes must use `WorkflowService`
- If direct revision is not implemented, show no fake UI; document the policy dependency in the handoff.

### Audit Export

- Add export of review audit logs for a submission or task-level review queue.
- Export must include persisted audit/human-review/AI-review metadata and must respect reviewer/owner permissions.

### Timeline and SLA Context

- Show current stage, reviewer assignment if any, SLA timing, and pending next action in the existing right-side/detail surfaces.
- Use existing `Timeline`, `StatusPill`, `StudioPanel`, and table components.

## Implementation Steps

- [ ] Define reviewer metrics, SLA, assignment, direct-revision, and audit-export policies with Supervisor if any are ambiguous.
- [ ] Add backend tests for reviewer metrics and audit export.
- [ ] Add assignment/direct-revision backend tests only if those policies are implemented.
- [ ] Implement backend routes/services/schemas without bypassing `WorkflowService`.
- [ ] Regenerate OpenAPI if contracts change.
- [ ] Update reviewer API/types.
- [ ] Update `ReviewQueue` and `ReviewSubmissionDetail` with metrics, SLA context, and supported decision controls.
- [ ] Add frontend tests for metrics, audit export, and final decision behavior.
- [ ] Update handoff with any policy-dependent deferred functionality.

## Required Tests

- Backend tests for:
  - reviewer metrics are scoped to the authenticated reviewer where applicable
  - audit export denies labelers
  - approve/return remains stage-valid
  - direct revision, if implemented, writes audit records and preserves previous attempts
- Frontend tests for:
  - metrics render from backend data
  - audit export action calls the expected endpoint
  - direct revision controls are present only when supported
  - queue filters and batch actions still work

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_review_api.py tests/test_review_integration_contracts.py tests/test_multistage_review.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python3 -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/reviewer
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

## Handoff Requirements

Create `docs/handoffs/<date>-task25-human-review-operations-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- final reviewer metric definitions
- SLA source and behavior
- assignment/claim policy if implemented
- direct revision policy and audit behavior, or explicit deferral reason
- audit export route/format/permissions
- UI consistency notes confirming the existing review layout remains coherent
