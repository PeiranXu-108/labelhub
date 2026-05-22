# LabelHub Multi-Agent Development Coordination

This document defines how multiple Codex coding agents should collaborate on LabelHub. Every agent must read this file and `docs/technical-solution.md` before making code changes.

## Global Objective

Deliver a working LabelHub MVP:

```text
Owner creates task and template
-> Labeler claims item and submits annotation
-> LangGraph AI review runs
-> Reviewer approves or returns
-> Owner exports approved data
```

The system must preserve these non-negotiable boundaries:

- Backend is Python.
- API framework is FastAPI.
- Agent module is LangChain + LangGraph.
- AI review output is structured and persisted.
- Workflow state changes go through `WorkflowService`.
- Published template schemas are immutable; changes create new versions.
- Audit logs record every meaningful workflow transition.

## Agent Roster

| Agent | Task File | Primary Ownership | Can Start When |
| --- | --- | --- | --- |
| Supervisor Agent | `docs/tasks/00-supervisor-agent.md` | Global plan, status board, reviews, conflict control | Immediately |
| Foundation Agent | `docs/tasks/01-foundation-contracts-agent.md` | Repo scaffold, backend/frontend foundations, shared contracts | Immediately |
| Backend Workflow Agent | `docs/tasks/02-backend-domain-api-agent.md` | SQLAlchemy models, migrations, FastAPI APIs, workflow service | After Foundation contracts |
| Template Agent | `docs/tasks/03-template-schema-agent.md` | Template schema, server validation, designer/renderer contracts | After Foundation contracts |
| AI Review Agent | `docs/tasks/04-ai-review-langgraph-agent.md` | LangGraph review graph, structured output, AI review jobs | After Backend workflow skeleton |
| Worker Export Agent | `docs/tasks/05-worker-export-agent.md` | Celery worker, export jobs, file writers | After Backend models |
| Owner Frontend Agent | `docs/tasks/06-frontend-owner-agent.md` | Owner console, task management, template designer, export UI | After API contracts |
| Labeler/Reviewer Frontend Agent | `docs/tasks/07-frontend-labeler-reviewer-agent.md` | Labeler workbench, review queue, submission detail | After API contracts |
| QA Docs Deploy Agent | `docs/tasks/08-qa-docs-deploy-agent.md` | E2E tests, README, API docs, Docker Compose, demo script | After first vertical slice |

## Recommended Execution Order

1. Supervisor Agent creates and maintains `docs/status-board.md`.
2. Foundation Agent scaffolds the repo and defines initial contracts.
3. Backend Workflow Agent and Template Agent proceed in parallel after contracts are stable.
4. AI Review Agent and Worker Export Agent proceed after core backend models exist.
5. Frontend agents proceed after OpenAPI/API contracts are available.
6. QA Docs Deploy Agent starts smoke tests once the first vertical slice works.

## Shared Files and Conflict Rules

High-conflict files owned by one agent at a time:

- `backend/app/domain/enums.py`: Foundation first, then Backend Workflow only.
- `backend/app/services/workflow.py`: Backend Workflow only.
- `backend/app/schemas/template.py`: Template Agent owns; Backend may review but not rewrite.
- `backend/app/agent/*`: AI Review Agent only.
- `frontend/src/api/*`: Foundation owns generation/setup; frontend agents may consume but not manually fork contracts.
- `docs/status-board.md`: Supervisor only.

If another agent needs a change in an owned file, they must write a request in their handoff summary and stop rather than making an opportunistic edit.

## Handoff Format

Every coding agent must end each work session with:

```markdown
## Agent Handoff

Agent: <name>
Task file: docs/tasks/<file>.md
Status: not started | in progress | blocked | ready for review | complete

Changed files:
- <path>

Verification run:
- <command>: <pass/fail/not run and why>

Contract changes:
- <API/schema/status change or "none">

Blockers:
- <blocker or "none">

Requests for Supervisor:
- <review/decision needed or "none">
```

## Supervisor Review Loop

The Supervisor Agent reviews after every agent handoff:

1. Check changed files against ownership boundaries.
2. Run the smallest relevant verification command.
3. Compare implementation against `docs/technical-solution.md`.
4. Update `docs/status-board.md`.
5. Give one of these decisions:
   - `approved`: agent may continue or task is complete.
   - `needs changes`: list exact files and expected correction.
   - `blocked`: define missing decision or dependency.
   - `integration risk`: stop parallel work touching the same contract.

## Status Board Format

The Supervisor should create `docs/status-board.md` with:

- current phase
- active agents
- task status table
- frozen contracts
- open decisions
- integration risks
- latest verification commands
- next recommended action

## Definition of Done For Any Agent

An agent task is complete only when:

- Required code is implemented.
- Tests relevant to the module pass or a concrete blocker is documented.
- No workflow state mutation bypasses `WorkflowService`.
- API/schema changes are reflected in contracts.
- The handoff summary is complete.
- Supervisor has approved the work.

