# Task 24: AI Pre-Review Operations Agent

## Mission

Add an operations-facing AI pre-review queue so owners/reviewers can inspect AI runs, monitor failures, view structured prompt/log details, and safely retry failed AI review jobs.

This task surfaces existing AI review workflow state. It must not change the model provider policy, structured-output requirement, or submission workflow semantics unless a focused backend contract is required for safe retry.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/24-ai-prereview-operations-agent.md`
- `docs/tasks/04-ai-review-langgraph-agent.md`
- `frontend/src/features/agent-workflow/AgentWorkflowTimeline.tsx`
- `frontend/src/features/agent-workflow/TaskAgentWorkflowSummary.tsx`
- `frontend/src/features/reviewer/ReviewQueue.tsx`
- `frontend/src/features/reviewer/ReviewSubmissionDetail.tsx`
- `backend/app/services/ai_review.py`
- `backend/app/services/agent_workflow.py`
- `backend/app/workers/ai_review.py`
- `backend/app/api/routes/review.py`
- `backend/app/models/__init__.py`

## Dependencies

- Tasks 04, 09, 18, and 20 are complete.
- Task 24 should run after Task 21 if owner navigation needs to link into the operations page.

## Owned Areas

- AI pre-review operations routes and schemas.
- AI review queue/list/detail/retry APIs.
- Frontend operations page or route for AI pre-review.
- AI review observability display and failure retry controls.
- Focused backend/frontend tests.
- OpenAPI snapshot if contracts change.
- `docs/handoffs/<date>-task24-ai-prereview-operations-handoff.md`

## Non-Owned Areas

- The core LangGraph node sequence unless a verified bug blocks retry semantics.
- LLM provider credential management and live provider selection.
- Human reviewer decision workflow.
- Labeler form runtime.

## Required Functional Scope

### AI Operations Queue

- Add a reviewer/owner-visible queue with tabs or filters for:
  - pending/queued
  - running
  - passed
  - returned
  - routed to human review
  - failed
- Show submission ID, task, labeler, attempt, AI decision, score, model name, retry count, idempotency key, timestamps, and current workflow status where available.

### AI Run Detail

- Show submission content and JSON field view.
- Show structured AI scores by dimension.
- Show AI verdict and reason/suggestions.
- Show prompt snapshot and structured response in an audit-safe panel.
- Show processing log entries from persisted review/audit records.

### Retry / Failure Handling

- Add a safe retry action for failed AI reviews.
- Retry must respect idempotency:
  - it must not create duplicate completed reviews for the same submission attempt
  - it must either create a new explicit retry attempt marker or document why the failed review is superseded
- Retrying must use `WorkflowService` for status transitions.
- Missing provider credentials must remain a controlled fallback and must not expose secrets.

### Configuration Visibility

- Show current review thresholds and model name from `ReviewConfig`.
- Configuration edits may link to the existing owner review config form, but this task should not invent provider-secret controls in the frontend.

## Implementation Steps

- [ ] Define AI operations queue/detail/retry API schemas.
- [ ] Add backend tests for queue filters, detail data, permission checks, and safe retry behavior.
- [ ] Implement backend routes/services and preserve existing AIReviewService semantics.
- [ ] Regenerate OpenAPI if routes are added.
- [ ] Add frontend route/API/types for AI operations.
- [ ] Build the operations page using existing Studio panels, tables, status pills, and JSON viewer components.
- [ ] Add frontend tests for queue filters, detail rendering, and retry action.
- [ ] Update handoff with final retry/idempotency policy.

## Required Tests

- Backend tests for:
  - owner/reviewer access and labeler denial
  - filtering by AI run status and decision
  - detail includes prompt snapshot, structured response, score, and idempotency metadata
  - retry does not duplicate completed idempotent runs
  - missing credentials return controlled state
- Frontend tests for:
  - queue tabs/filters send expected params
  - detail shows structured prompt/response data
  - retry action handles success and controlled failure states

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py tests/test_agent_workflow_api.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python3 -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/agent-workflow src/features/reviewer
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

## Handoff Requirements

Create `docs/handoffs/<date>-task24-ai-prereview-operations-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- final AI operations route list and filters
- detail payload shape
- retry and idempotency policy
- missing-provider behavior
- permissions
- UI consistency notes confirming no unrelated reviewer redesign was introduced
