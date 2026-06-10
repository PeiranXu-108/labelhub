# Task 18: Multistage Human Review Agent

## Mission

Upgrade human review from a single approve/return action set into an explicit multi-stage review flow with initial review, re-review, final review, and round-by-round diff visibility.

This task owns review-stage state, review history presentation, and reviewer UI semantics. It must preserve WorkflowService as the authority for status transitions.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/18-multistage-human-review-agent.md`
- `docs/tasks/09-review-integration-contracts-agent.md`
- Current review schemas/routes in `backend/app/schemas/review.py` and `backend/app/api/routes/review.py`
- Current `WorkflowService` in `backend/app/services/workflow.py`
- Current reviewer UI in `frontend/src/features/reviewer/`

## Dependencies

- Task 09 review integration contracts are approved.
- Task 10 auth login is approved.
- Task 15 is optional but useful if diff rendering needs schema-aware field labels.

## Owned Areas

- `backend/app/domain/enums.py` only if review stage enums are approved by Supervisor.
- `backend/app/models/` review-related models.
- `backend/app/schemas/review.py`
- `backend/app/api/routes/review.py`
- `backend/app/services/workflow.py` only for reviewed, tested stage/status transitions required by this task.
- `backend/app/services/submissions.py` or review service files if review logic is colocated there.
- Alembic migrations for review stage persistence.
- Backend review tests.
- `frontend/src/features/reviewer/`
- `frontend/src/features/labeler/` only to display returned-stage context if needed.
- Generated `frontend/src/api/openapi.json` only via backend OpenAPI export.
- `docs/api.md`, `docs/demo-script.md`, and `docs/handoffs/<date>-task18-multistage-human-review-handoff.md`

## Non-Owned Areas

- AI review graph execution.
- Export worker behavior.
- Template publishing semantics.
- Auth/login behavior.

## Required Review Model

Introduce explicit review stages:

- `initial_review`
- `re_review`
- `final_review`

For each human review record, persist:

- stage
- round number
- decision
- reason/comment
- reviewer ID
- compared attempt numbers when applicable
- structured review metadata
- created timestamp

Final approval should be distinguishable from intermediate approval if policy requires another stage.

## Required Backend Behavior

- Review queue can filter by review stage.
- Review detail returns stage history and round comparison metadata.
- Approve/return actions validate the allowed decision for the current stage.
- Workflow transitions still go through `WorkflowService`.
- Audit logs record stage and round.
- Previous-attempt diff data must come from persisted attempt snapshots, not reconstructed mutable payloads.

## Required Frontend Behavior

- Reviewer queue shows review stage and can filter by stage.
- Reviewer detail shows stage timeline.
- Reviewer detail renders round 1/round 2 diff view when at least two attempts exist.
- Diff view should compare answers field-by-field using template labels when available and JSON fallback otherwise.
- Return dialog records stage-aware reason/comment.
- Labeler returned revision view shows the relevant stage and reason when available.

## Implementation Steps

- [ ] Define review-stage enum and persistence shape.
- [ ] Add migration for stage/round metadata if current tables cannot represent it safely.
- [ ] Update review action schemas/routes/services to enforce stage-aware decisions.
- [ ] Update `WorkflowService` transition tests if new statuses or transitions are needed.
- [ ] Expand review queue/detail contracts for stage filters, stage history, and round diff metadata.
- [ ] Update reviewer queue/detail UI for stage display, filters, timeline, and diff view.
- [ ] Update labeler returned context if backend response includes stage-specific reason.
- [ ] Add backend and frontend tests for stage transitions and diff rendering.
- [ ] Regenerate OpenAPI.
- [ ] Create the standard handoff.

## Required Tests

- Initial review approve/return follows the allowed transition matrix.
- Re-review sees prior returned attempt history.
- Final review is persisted as a distinct stage.
- Invalid stage decision is rejected.
- Review queue filters by stage.
- Review detail returns stage history and round comparison data.
- Round diff view renders changed, added, and removed answer fields.
- Workflow status mutation still occurs only through `WorkflowService`.
- Labeler sees the latest relevant stage reason after return.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_review_api.py tests/test_review_integration_contracts.py tests/test_multistage_review.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/reviewer src/features/labeler
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

If `tests/test_multistage_review.py` does not exist yet, create it for stage-specific backend coverage.

## Handoff Requirements

Create `docs/handoffs/<date>-task18-multistage-human-review-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Final review stage enum and transition policy.
- Migration name and backfill behavior for existing reviews.
- Review queue/detail contract changes.
- Diff algorithm and field-label behavior.
- WorkflowService changes and tests.
- OpenAPI regeneration result.
- Backend/frontend tests and build results.
- Any product decisions needed for review staffing or escalation policy.

