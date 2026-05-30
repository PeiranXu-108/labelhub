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
| Review Integration Contracts Agent | `docs/tasks/09-review-integration-contracts-agent.md` | Reviewer/labeler backend read contracts and minimal frontend consumers | After Task 07 integration-risk review |
| Auth Login Agent | `docs/tasks/10-auth-login-agent.md` | Real username/password login, auth routes, frontend route guards, demo user seed flow | After Task 08 approval if placeholder login must be closed before final review |
| Task Metadata and Rewards Agent | `docs/tasks/11-task-metadata-rewards-agent.md` | Rich task instructions, tags, reward-rule metadata, owner/labeler task metadata surfaces | After Task 10 approval if expanded task basics are in scope |
| Dataset Import Pipeline Agent | `docs/tasks/12-dataset-import-pipeline-agent.md` | JSONL/Excel import, preview validation, batch edit, item import UX | After Task 10 approval; coordinate with Task 11/13 owner page edits |
| Template Designer Builder Agent | `docs/tasks/13-template-designer-builder-agent.md` | Drag-and-drop template builder and full property inspector | After Task 03 and Task 06 approval |
| Rich Text and Media Fields Agent | `docs/tasks/14-rich-media-fields-agent.md` | Rich-text, image, and file field schema, uploads, renderer/designer support | After Task 03; preferably after Task 13 |
| Dynamic Form Runtime Agent | `docs/tasks/15-dynamic-form-runtime-agent.md` | Conditional visibility, linked validation, regex/custom validators, groups/tabs | After Task 03; coordinate with Task 13 |
| LLM Field Loop Agent | `docs/tasks/16-llm-field-loop-agent.md` | Field-level LLM assist calls, structured result validation, target-field writeback | After Tasks 03 and 04; preferably after Task 15 |
| Labeler Navigation Agent | `docs/tasks/17-labeler-navigation-agent.md` | Previous/next/skip navigation and draft preservation | After Tasks 07, 09, and 10 |
| Multistage Human Review Agent | `docs/tasks/18-multistage-human-review-agent.md` | Initial/re-review/final review stages and round diff views | After Tasks 09 and 10 |
| Production Readiness Agent | `docs/tasks/19-production-readiness-agent.md` | Docker runtime verification, live-AI preflight, production limitation docs | After Task 08 and Task 10; after Task 16 for live field-assist checks |
| QA Docs Deploy Agent | `docs/tasks/08-qa-docs-deploy-agent.md` | E2E tests, README, API docs, Docker Compose, demo script | After first vertical slice and Task 09 if dispatched |

## Recommended Execution Order

1. Supervisor Agent creates and maintains `docs/status-board.md`.
2. Foundation Agent scaffolds the repo and defines initial contracts.
3. Backend Workflow Agent and Template Agent proceed in parallel after contracts are stable.
4. AI Review Agent and Worker Export Agent proceed after core backend models exist.
5. Frontend agents proceed after OpenAPI/API contracts are available.
6. Review Integration Contracts Agent runs if Supervisor flags Task07 reviewer/template API gaps as MVP requirements.
7. QA Docs Deploy Agent starts smoke tests once the first vertical slice works and Task09 integration contracts are approved if dispatched.
8. Auth Login Agent runs after QA if the remaining placeholder `/login` limitation must be closed before final integration review.
9. Follow-up Tasks 11-19 run only if the expanded requirements remain in scope after Supervisor triage.
10. Recommended follow-up order:
   - Task 11 first for expanded task metadata.
   - Tasks 12 and 13 may run in parallel only if they avoid the same owner page container.
   - Task 14 after Task 13 if designer controls are needed.
   - Task 15 after Task 13 so runtime semantics match authoring controls.
   - Task 16 after Task 15 when field-level LLM results should validate/write back immediately.
   - Tasks 17 and 18 can run after Task 09/10, but should not overlap on reviewer/labeler shared API types without coordination.
   - Task 19 closes production readiness evidence after the desired feature follow-ups are approved or explicitly descoped.

## Shared Files and Conflict Rules

High-conflict files owned by one agent at a time:

- `backend/app/domain/enums.py`: Foundation first, then Backend Workflow only.
- `backend/app/services/workflow.py`: Backend Workflow only.
- `backend/app/schemas/template.py`: Template Agent owns; Backend may review but not rewrite.
- `backend/app/agent/*`: AI Review Agent only.
- `frontend/src/api/*`: Foundation owns generation/setup; frontend agents may consume but not manually fork contracts.
- `docs/status-board.md`: Supervisor only.
- Task09 may update `backend/app/schemas/template.py` only to reuse existing read schemas or imports. It must not change `TemplateDocument`, field discriminators, or published schema semantics without Supervisor approval.
- Task09 may update Task07 frontend consumers only where needed to consume its new backend contracts.
- Task10 may update auth dependencies, user password persistence, login UI, route guards, seed/demo scripts, OpenAPI, and docs. It must not change workflow, template, AI review, export, or reviewer business semantics.
- Task10 must keep JWT username/password as the MVP auth mode, must not add self-registration without Supervisor approval, and must not silently create real application users from arbitrary bearer tokens.
- Task11 may update task metadata models/schemas/routes/services, owner task forms, labeler read surfaces, OpenAPI, and metadata docs. It must not implement real payout/payment execution without Supervisor/user approval.
- Task12 may update item import APIs/services and `DatasetImportPanel`. It must not change assignment claiming or workflow transitions.
- Task13 owns the template authoring UX. It may update schema types only to match backend-approved template properties and must not change published schema immutability.
- Task14 may add rich-text/media field types and upload storage contracts. It must keep upload/download permission checks server-side and document MVP storage limitations.
- Task15 owns dynamic form runtime semantics and backend validation parity. It must not execute arbitrary user-authored JavaScript or Python from template JSON.
- Task16 may reuse server-side LLM provider configuration for field-level assist. It must not expose provider credentials in frontend code or alter AI review workflow decisions.
- Task17 may update labeler navigation/skip contracts. It must audit skip behavior and preserve draft data.
- Task18 may update review-stage contracts and `WorkflowService` only with focused tests and Supervisor review; it must not bypass `WorkflowService` for stage/status changes.
- Task19 may update deployment/docs/runtime verification scripts. It must not claim Docker runtime verification unless Docker startup actually succeeds in the environment.

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
