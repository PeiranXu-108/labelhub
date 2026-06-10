# Task 11: Task Metadata and Rewards Agent

## Mission

Close the task-creation metadata gap by expanding task basics beyond name, plain description, distribution, quota, and deadline.

This task owns rich task instructions, tags, reward rules, and owner-facing edit/read surfaces. It must keep workflow behavior unchanged and must not turn reward rules into payment execution.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/11-task-metadata-rewards-agent.md`
- Current task schemas in `backend/app/schemas/task.py`
- Current task routes/services in `backend/app/api/routes/tasks.py` and `backend/app/services/tasks.py`
- Current owner task create/edit UI in `frontend/src/features/owner/`

## Dependencies

- Task 02 backend domain/API is approved.
- Task 06 owner frontend is approved.
- Task 10 auth login is approved so created/updated metadata remains role protected.

## Owned Areas

- `backend/app/models/task.py` or the existing task model file if task fields are colocated.
- `backend/app/schemas/task.py`
- `backend/app/services/tasks.py`
- `backend/app/api/routes/tasks.py`
- Alembic migrations for new task metadata columns/tables.
- Backend task API tests under `backend/tests/`.
- `frontend/src/features/owner/TaskCreateDrawer.tsx` or the current create/edit drawer component.
- `frontend/src/features/owner/TaskDetail*` and owner task list/detail types as needed.
- `frontend/src/features/owner/types.ts`
- Generated `frontend/src/api/openapi.json` only via backend OpenAPI export.
- `docs/api.md`, `docs/demo-script.md`, and `docs/known-limitations.md` if user-visible task metadata behavior changes.
- `docs/handoffs/<date>-task11-task-metadata-rewards-handoff.md`

## Non-Owned Areas

- `backend/app/services/workflow.py`
- Template schema field discriminators.
- AI review graph or model provider behavior.
- Export worker execution.

## Product Decisions Frozen For This Task

- Rich task instructions are stored as sanitized rich-text/structured content, not executable HTML.
- Tags are owner-managed strings for search/filtering and display.
- Reward rules are metadata for task policy and reporting only; no money movement, payout ledger, or external payment integration is introduced in this task.
- Backend validation is authoritative. Frontend validation is advisory only.

If real payment settlement, tax handling, or marketplace pricing policy is required, stop and request Supervisor/user approval before implementation.

## Required Backend Contract

Expand task create/update/read contracts to support:

- `instruction_rich_text`: structured rich-text payload or sanitized HTML/Markdown string with a documented shape.
- `instruction_plain_text`: searchable plain-text fallback derived from or submitted alongside rich text.
- `tags`: string array with unique normalized values.
- `reward_rule`: object containing at least:
  - `mode`: `none`, `fixed_per_accepted_submission`, or `manual`
  - `currency`: ISO currency code when mode is not `none`
  - `amount`: decimal amount when mode is `fixed_per_accepted_submission`
  - `description`: optional owner-visible policy text
- `quality_rules`: optional structured notes for acceptance criteria if the existing review config does not already cover them.

Backend must reject:

- empty tag values
- duplicate tags after normalization
- negative reward amounts
- reward currency without reward mode
- reward amount without a compatible reward mode
- unsafe rich-text payloads according to the chosen sanitizer/format rules

## Required Frontend Behavior

- Owner create/edit task drawer must expose rich instructions, tags, and reward-rule editing.
- Task detail/dashboard must display rich instructions, tags, and reward policy.
- Labeler marketplace and workbench must show task instructions, tags, and reward policy in read-only form if the relevant endpoint returns them.
- Forms must show validation errors from backend responses instead of silently dropping fields.

## Implementation Steps

- [ ] Add backend migration and model fields/tables for task rich instructions, tags, reward rules, and optional quality rules.
- [ ] Expand `TaskCreate`, `TaskUpdate`, and `TaskRead` schemas with documented validation.
- [ ] Update task create/update/read routes and services to persist and return the new metadata.
- [ ] Add backend tests for valid metadata, duplicate tags, invalid reward rules, and unsafe rich-text rejection.
- [ ] Update owner create/edit UI and owner task detail UI to edit/read the new fields.
- [ ] Update labeler task marketplace/workbench read surfaces if their contracts already include task metadata.
- [ ] Regenerate `frontend/src/api/openapi.json`.
- [ ] Update user-facing docs for the final task metadata shape.
- [ ] Create the standard handoff.

## Required Tests

- Creating a task with rich instructions, tags, and a fixed reward rule persists all fields.
- Updating metadata does not mutate workflow state.
- Duplicate tags after normalization are rejected.
- Negative reward amounts are rejected.
- Reward amount/currency combinations are validated.
- Unsafe rich-text content is rejected or sanitized according to the documented policy.
- Owner UI submits the expanded payload.
- Labeler read surfaces display task instructions/tags/reward policy when present.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_tasks.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

If a named test file has been split or renamed, run the closest task API and owner frontend tests and report the exact command.

## Handoff Requirements

Create `docs/handoffs/<date>-task11-task-metadata-rewards-handoff.md` with the standard `## Agent Handoff` block from `docs/agent-coordination.md`.

Also report:

- Final `TaskCreate`, `TaskUpdate`, and `TaskRead` field shapes.
- Migration name and any backfill behavior.
- Rich-text storage/sanitization policy.
- Tag normalization behavior.
- Reward-rule validation behavior and explicit non-goals.
- OpenAPI regeneration result.
- Backend/frontend tests and build results.
- Any product decisions still needed before production use.

