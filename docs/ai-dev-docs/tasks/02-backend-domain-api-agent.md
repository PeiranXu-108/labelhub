# Task 02: Backend Domain API Agent

## Mission

Implement the core backend domain: users, tasks, items, assignments, submissions, audit logs, review configs, and workflow transitions.

This agent owns the business state machine. No other agent may mutate workflow statuses directly.

## Dependencies

- Task 01 must provide backend scaffold and shared enums.

## Owned Areas

- `backend/app/models/`
- `backend/app/schemas/`
- `backend/app/services/workflow.py`
- `backend/app/services/tasks.py`
- `backend/app/services/submissions.py`
- `backend/app/api/routes/tasks.py`
- `backend/app/api/routes/labeler.py`
- `backend/app/api/routes/review.py`
- `backend/app/api/routes/audit.py`
- Alembic migrations

## Expected Deliverables

- SQLAlchemy models and migrations.
- Pydantic request/response schemas.
- Role-aware FastAPI endpoints for owner, labeler, and reviewer flows.
- Central `WorkflowService`.
- Audit log creation in every transition.

## Implementation Steps

- [ ] Create SQLAlchemy models:
  - `User`
  - `Task`
  - `TaskItem`
  - `Assignment`
  - `TemplateSchema`
  - `ReviewConfig`
  - `Submission`
  - `AIReview`
  - `HumanReview`
  - `AuditLog`
  - `ExportJob`
- [ ] Add Alembic migration for all core tables.
- [ ] Implement auth dependency stubs or real JWT dependency based on Task 01.
- [ ] Implement `WorkflowService.transition_submission(...)`.
- [ ] Implement task endpoints:
  - create/list/detail/update
  - publish/pause/end
  - item import/list
- [ ] Implement labeler endpoints:
  - task marketplace
  - claim item
  - get assignment
  - save draft
  - submit
  - list own submissions
- [ ] Implement reviewer endpoints:
  - review queue
  - submission detail
  - approve
  - return with required reason
  - batch operation
- [ ] Implement audit query endpoint.
- [ ] Ensure every status-changing endpoint uses `WorkflowService`.

## Workflow Rules To Enforce

Task transitions:

```text
DRAFT -> PUBLISHED
PUBLISHED -> PAUSED
PAUSED -> PUBLISHED
PUBLISHED -> ENDED
PAUSED -> ENDED
```

Submission transitions:

```text
DRAFT -> SUBMITTED
SUBMITTED -> AI_REVIEWING
AI_REVIEWING -> AI_PASSED
AI_REVIEWING -> AI_RETURNED
AI_REVIEWING -> NEEDS_HUMAN_REVIEW
AI_PASSED -> HUMAN_REVIEWING
NEEDS_HUMAN_REVIEW -> HUMAN_REVIEWING
HUMAN_REVIEWING -> APPROVED
HUMAN_REVIEWING -> RETURNED
APPROVED -> EXPORTABLE
RETURNED -> DRAFT
```

## Required Tests

- Invalid task transition is rejected.
- Invalid submission transition is rejected.
- Labeler cannot approve submissions.
- Reviewer cannot create tasks.
- Return action requires a reason.
- Audit log is written in the same transaction as a status transition.
- Claiming an item respects task status and assignment ownership.

## Verification Commands

```bash
cd backend && pytest tests/test_workflow.py tests/test_tasks_api.py tests/test_labeler_api.py tests/test_review_api.py
```

## Handoff Requirements

Report:

- migration names
- final API route list
- workflow matrix test results
- any API contract changes needed by frontend agents

