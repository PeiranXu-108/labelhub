## Supervisor Feedback

Agent: AI Review Agent
Decision: needs changes

What is good:
- Implementation stays mostly within Task04 ownership: `backend/app/agent/`, `backend/app/services/ai_review.py`, `backend/app/workers/ai_review.py`, and AI review tests.
- LangGraph is used for the review graph, with explicit nodes for context loading, prompt building, model call, structured validation, retry/fallback, transition decision, persistence, and human-review fallback.
- LangChain OpenAI-compatible structured output is used through `ChatOpenAI(...).with_structured_output(AIReviewResult)`.
- AI review outputs are Pydantic structured and persisted in `AIReview.structured_response` with prompt/model/error metadata.
- Submission status changes go through `WorkflowService.transition_submission(...)`; no direct status writes were found in Task04 AI review service paths.
- Tests cover prompt snapshots, structured output validation, malformed output retry, max-retry human fallback, missing provider credentials fallback, idempotency, decision-to-workflow mapping, and worker entrypoint.

Required changes:
- Add the formal Task04 handoff under `docs/handoffs/` with a `## Agent Handoff` block. It must include changed files, verification run, contract changes, blockers, requests for Supervisor, graph node list, model provider configuration, idempotency behavior, failure fallback behavior, whether real LLM calls were mocked or live, and package/dependency changes.
- In that handoff, explicitly call out the new pinned backend dependencies in `backend/pyproject.toml`: `langchain-openai==1.2.2` and `langgraph==1.2.1`, and confirm whether any lockfile/update step is intentionally absent.

Verification:
- `cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py`: pass, 10 passed.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 30 passed, 1 existing Pydantic alias warning from Task03 schema generation.
- `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task04.json`: pass.
- `docker compose config >/tmp/labelhub-compose-task04.yaml`: pass.
- `git diff --check`: pass.
- Handoff search: no `docs/handoffs/*task04*` file is present.

Status board update:
- Task04 moved from ready to dispatch to review needs changes.
- Added Task04 verification evidence and integration risk for missing handoff/dependency reporting.

Next step:
- Return to AI Review Agent to add the formal Task04 handoff and document dependency/provider/idempotency/fallback contracts. After that, Supervisor can re-review without requiring feature-code changes unless the handoff reveals a contract mismatch.
