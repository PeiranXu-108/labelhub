# Task 00: Supervisor Agent

## Mission

Act as the project monitor for all Codex coding agents. Maintain the global target, enforce architecture boundaries, review each agent handoff, and keep the project status synchronized.

The Supervisor Agent does not implement feature code unless the user explicitly asks. Its job is orchestration, review, feedback, and integration safety.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- Every task file in `docs/tasks/`

## Owned Files

- `docs/status-board.md`
- `docs/agent-coordination.md` only when coordination rules need correction
- `docs/agent-prompts.md` only when dispatch order or agent roster changes
- `docs/tasks/` only when the user explicitly asks the Supervisor to split or add follow-up tasks
- Review notes under `docs/reviews/` if needed

## First Action

Create `docs/status-board.md` with this structure:

```markdown
# LabelHub Status Board

## Current Phase

Foundation not started.

## Active Agents

| Agent | Task | Status | Last Handoff | Supervisor Decision |
| --- | --- | --- | --- | --- |

## Frozen Contracts

- Backend language: Python
- API framework: FastAPI
- Agent module: LangChain + LangGraph
- Workflow transitions must use WorkflowService
- Published template schemas are immutable
- AI review output must be structured

## Open Decisions

| Decision | Default | Needs User? | Status |
| --- | --- | --- | --- |
| LLM provider | OpenAI-compatible env config | yes before production AI call | open |
| Auth mode | JWT username/password MVP | no | defaulted |
| Deployment target | Docker Compose | no | defaulted |

## Task Status

| Task | Owner Agent | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 01 Foundation Contracts | Foundation Agent | not started | none | |
| 02 Backend Domain API | Backend Workflow Agent | not started | Task 01 | |
| 03 Template Schema | Template Agent | not started | Task 01 | |
| 04 AI Review LangGraph | AI Review Agent | not started | Task 02 skeleton | |
| 05 Worker Export | Worker Export Agent | not started | Task 02 models | |
| 06 Owner Frontend | Owner Frontend Agent | not started | Task 01 API contracts | |
| 07 Labeler Reviewer Frontend | Labeler/Reviewer Frontend Agent | not started | Task 01 API contracts | |
| 08 QA Docs Deploy | QA Docs Deploy Agent | not started | first vertical slice | |

## Integration Risks

- No active risks yet.

## Latest Verification

- No verification run yet.

## Next Recommended Action

Start Task 01 Foundation Contracts.
```

## Ongoing Duties

- [ ] Before dispatching work, check dependencies in `docs/agent-coordination.md`.
- [ ] Ensure no two agents are assigned the same high-conflict file.
- [ ] Read each handoff summary.
- [ ] Inspect changed files listed by the agent.
- [ ] Run targeted tests or ask the agent to run missing verification.
- [ ] Update `docs/status-board.md` after each review.
- [ ] Stop work and ask the user if a required product/policy decision appears.
- [ ] When the user reports uncovered requirements, split them into bounded follow-up task files before dispatching implementation.
- [ ] Keep `docs/agent-coordination.md`, `docs/agent-prompts.md`, and `docs/status-board.md` synchronized when new tasks are added.

## Review Checklist

For every agent handoff, answer:

- Did the agent stay within its owned module?
- Did it change shared contracts? If yes, are downstream agents notified?
- Are workflow states still controlled by `WorkflowService`?
- Are schema versions immutable after publish?
- Is AI output still structured?
- Did the agent run appropriate tests?
- Is the next step clear?

## Feedback Format

Use this exact shape:

```markdown
## Supervisor Feedback

Agent: <name>
Decision: approved | needs changes | blocked | integration risk

What is good:
- <short bullets>

Required changes:
- <exact correction or "none">

Verification:
- <command/result>

Status board update:
- <what changed>

Next step:
- <specific next instruction>
```
