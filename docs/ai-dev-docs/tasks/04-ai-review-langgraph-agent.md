# Task 04: AI Review LangGraph Agent

## Mission

Implement the AI pre-review Agent using LangChain and LangGraph. The Agent reviews submitted annotation data, returns structured scoring, and transitions submissions through the workflow using backend services.

## Dependencies

- Task 02 must provide `Submission`, `AIReview`, `ReviewConfig`, `AuditLog`, and `WorkflowService`.
- Task 03 must provide template schema snapshots and submission validation shape.

## Owned Areas

- `backend/app/agent/`
- `backend/app/services/ai_review.py`
- `backend/app/workers/ai_review.py`
- AI review tests

## Expected Deliverables

- LangGraph review graph.
- LangChain model adapter with OpenAI-compatible configuration.
- Pydantic structured output schema.
- AI review persistence.
- Retry and human fallback behavior.
- Idempotency by `submission_id + attempt`.

## Graph Design

```text
START
-> load_context
-> build_prompt
-> call_model
-> validate_output
-> decide_transition
-> persist_review
-> END

call_model error -> retry_or_fail
validate_output error -> retry_or_fail
retry_or_fail exhausted -> mark_needs_human_review -> END
```

## Implementation Steps

- [ ] Create `AIReviewResult` and nested score Pydantic models.
- [ ] Create model provider config:
  - `LLM_PROVIDER`
  - `LLM_MODEL`
  - `LLM_BASE_URL`
  - `LLM_API_KEY`
  - `LLM_TEMPERATURE`
- [ ] Implement prompt builder using task, item, submission, schema snapshot, and review config.
- [ ] Implement LangChain structured output call.
- [ ] Implement LangGraph nodes listed above.
- [ ] Persist prompt snapshot, structured result, model metadata, status, retry count.
- [ ] Transition submission through `WorkflowService` only.
- [ ] Implement max retry behavior.
- [ ] On malformed output or provider failure after retries, transition to `NEEDS_HUMAN_REVIEW`.
- [ ] Add Celery task or worker entrypoint for AI review.

## Required Tests

- Prompt builder uses snapshots, not mutable task/template data.
- Structured output validates valid model response.
- Malformed output triggers retry.
- Max retry exhaustion creates human-review fallback.
- Existing completed review for same idempotency key is not duplicated.
- AI decision maps to correct workflow transition.

## Verification Commands

```bash
cd backend && pytest tests/test_ai_review_agent.py tests/test_ai_review_worker.py
```

## Handoff Requirements

Report:

- graph node list
- model provider configuration
- idempotency behavior
- failure fallback behavior
- whether real LLM calls were mocked or live

