# Task 04 AI Review LangGraph Handoff - 2026-05-23

## Agent Handoff

Agent: AI Review LangGraph Agent
Task file: docs/tasks/04-ai-review-langgraph-agent.md
Status: ready for review

Changed files:
- backend/pyproject.toml
- backend/app/agent/__init__.py
- backend/app/agent/config.py
- backend/app/agent/graph.py
- backend/app/agent/prompts.py
- backend/app/agent/providers.py
- backend/app/agent/schemas.py
- backend/app/services/ai_review.py
- backend/app/workers/__init__.py
- backend/app/workers/ai_review.py
- backend/tests/test_ai_review_agent.py
- backend/tests/test_ai_review_worker.py
- docs/handoffs/2026-05-23-task04-ai-review-langgraph-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py -q: pass, 10 tests passed
- cd backend && ./.venv313/bin/pytest -q: pass, 30 tests passed, 1 existing Pydantic alias warning from Task03 schema generation
- python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task04.json: pass
- docker compose config >/tmp/labelhub-compose-task04.yaml: pass
- git diff --check: pass

Graph node list:
- load_context
- build_prompt
- call_model
- validate_output
- retry_or_fail
- decide_transition
- persist_review
- mark_needs_human_review

Model provider configuration:
- Provider config is read from server-side environment variables: LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL, LLM_API_KEY, and LLM_TEMPERATURE.
- Default provider is OpenAI-compatible.
- Task ReviewConfig can override model name and temperature for a run.
- Live model construction uses LangChain ChatOpenAI with with_structured_output(AIReviewResult).
- If LLM_API_KEY is missing, the service uses a failing placeholder model that creates an auditable failed review and falls back to human review instead of making a live provider call.

Idempotency behavior:
- Idempotency key is submission_id + attempt, stored as "<submission_id>:<attempt>".
- Before running the graph, AIReviewService checks existing completed or failed AIReview records for the same idempotency key.
- Existing records for the same key are returned without another model call or duplicate persistence.
- Retry attempts for the same graph run update in-memory graph state and are summarized in AIReview.error_metadata.retry_count and error_metadata.errors.

Failure fallback behavior:
- Provider exceptions, malformed structured output, missing credentials, and max retry exhaustion route through retry_or_fail.
- When retries are exhausted, mark_needs_human_review persists a failed AIReview record with decision human_review.
- Fallback transitions the submission through WorkflowService.transition_submission(..., REQUIRE_HUMAN_REVIEW); Task04 code does not mutate submission status directly.
- Prompt snapshot, structured fallback result, model metadata, retry count, idempotency key, and failure reason are persisted for audit.

Calls mocked or live:
- Verification used mocked/injected model calls only.
- No live LLM calls were made.
- Live calls require LLM_API_KEY and any required LLM_BASE_URL/provider configuration in the backend runtime environment.

Package/dependency changes:
- Added backend dependency langchain-openai==1.2.2 in backend/pyproject.toml.
- Added backend dependency langgraph==1.2.1 in backend/pyproject.toml.
- No backend lockfile exists in this repository for the current pip/pyproject setup, so no lockfile update was performed.
- The local backend virtualenv was updated during verification so tests could import LangChain and LangGraph.

Contract changes:
- Added the AIReviewResult Pydantic schema and nested CriterionScore schema.
- AI review output remains structured and Pydantic-validated; free-form LLM text is not parsed as truth.
- AI review persistence uses existing AIReview fields for structured_response, prompt_snapshot, model_name, raw_provider_response, and error_metadata.
- Submission workflow changes continue to route through WorkflowService only.

Blockers:
- User/provider decision remains open before live AI calls: choose the OpenAI-compatible provider and configure LLM_API_KEY plus any provider-specific base URL/model settings.

Requests for Supervisor:
- Re-review Task04 after this formal handoff addition.
- Confirm the dependency reporting is sufficient for the current pip/pyproject setup without a lockfile.
