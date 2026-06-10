# 2026-06-08 Product Gap Requirements Review

## Supervisor Feedback

Agent: Supervisor Agent
Decision: requirements split

What is good:
- The current codebase has a working MVP flow, but the product screenshots require additional operational functionality beyond the approved Tasks 11-20 scope.
- The six uncovered areas are separable enough to become bounded follow-up tasks without forcing broad, high-conflict rewrites.
- Each new task is constrained to functional completion and must preserve the existing Studio/Ant Design visual language.

Required changes:
- Create follow-up task requirements for the six missing areas:
  - Task21 owner task operations
  - Task22 template advanced authoring
  - Task23 labeler productivity workbench
  - Task24 AI pre-review operations
  - Task25 human review operations
  - Task26 production policy/readiness
- Update `docs/agent-prompts.md`, `docs/agent-coordination.md`, and `docs/status-board.md` so future agents can be dispatched safely.

Verification:
- Docs-only requirements update; no backend/frontend feature code changed.
- Required verification is `git diff --check` after edits.

Status board update:
- Tasks 21-26 are marked `requirements drafted`, not implemented.
- Task26 remains policy-gated for production identity, storage/scanning/retention, live AI, Docker-mode E2E, and payout decisions.

Next step:
- Dispatch Task21 first unless the user prioritizes template authoring or labeler productivity ahead of owner task operations.
