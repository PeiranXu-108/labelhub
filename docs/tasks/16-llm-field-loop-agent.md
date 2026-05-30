# Task 16: LLM Field Loop Agent

## Mission

Turn `llm_trigger` from a displayed button-like field into a closed-loop, field-level LLM assist workflow: invoke a server-side model call, validate structured output, and write suggestions or prefilled answers back into target fields.

This task owns interactive LLM assist behavior inside annotation forms. It must keep model credentials server-side and must not bypass the existing structured-output discipline from the AI review agent.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/16-llm-field-loop-agent.md`
- `docs/tasks/04-ai-review-langgraph-agent.md`
- Current `llm_trigger` schema in `backend/app/schemas/template.py`
- Current renderer handling in `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- Current AI provider configuration in `backend/app/agent/` and `backend/app/services/ai_review.py`
- `docs/known-limitations.md`

## Dependencies

- Task 03 template schema is approved.
- Task 04 AI review provider/structured-output patterns are approved.
- Task 15 is recommended if target-field validation should run immediately after prefill.

## Owned Areas

- `backend/app/schemas/template.py` for `llm_trigger` contract extensions.
- Backend LLM assist service under `backend/app/services/` or `backend/app/agent/` if shared provider code belongs there.
- Backend API route for field-level LLM assist.
- Backend tests for LLM assist contracts, provider failures, and permission checks.
- `frontend/src/features/schema-renderer/types.ts`
- `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- Frontend schema renderer tests.
- `docs/api.md`, `docs/demo-script.md`, and `docs/known-limitations.md`
- `docs/handoffs/<date>-task16-llm-field-loop-handoff.md`

## Non-Owned Areas

- AI review graph decisions and workflow transitions.
- Review queue behavior.
- Arbitrary client-side model calls.
- Storing provider credentials in frontend code.

## Required Schema Contract

Extend `llm_trigger` to support:

- `promptTemplate`
- `targetFieldId`
- `mode`: `suggest`, `prefill`, or `overwrite_with_confirmation`
- `outputSchema`: structured schema for the expected model response or a named output preset
- `contextFields`: optional source field IDs included in the prompt context
- `temperature` or model options only if safely whitelisted server-side

## Required Backend Behavior

- Add a server-side endpoint for invoking field-level LLM assist for an assignment/submission context.
- Build prompts from the frozen template snapshot, current item payload, and current answers.
- Validate model output against `outputSchema` or the target field type before returning it.
- Persist an audit record or assist log with prompt snapshot, model name, target field, status, and failure reason.
- Return a safe failure when no `LLM_API_KEY` or configured provider is available.
- Enforce labeler/reviewer/owner permissions according to where the assist is available.

## Required Frontend Behavior

- Renderer displays `llm_trigger` as an actionable control with loading/error/success states.
- Trigger result can:
  - show a suggestion without changing answers
  - prefill target field
  - request confirmation before overwriting an existing answer
- Result writeback calls `onChange` so autosave can persist the new value.
- Trigger is disabled in read-only rendering unless a reviewer-assist mode is explicitly implemented.

## Implementation Steps

- [ ] Extend `llm_trigger` schema and frontend types.
- [ ] Add backend LLM assist service reusing the existing provider configuration patterns.
- [ ] Add authenticated API route for field-level LLM assist.
- [ ] Add provider-missing, malformed-output, and permission tests.
- [ ] Update renderer to invoke assist endpoint and write returned values to target fields.
- [ ] Add frontend tests for suggest, prefill, overwrite confirmation, and failure display.
- [ ] Regenerate OpenAPI if API contracts changed.
- [ ] Update docs and known limitations for live AI configuration.
- [ ] Create the standard handoff.

## Required Tests

- Valid trigger call returns structured suggestion for the target field.
- Missing provider credentials returns a controlled error without frontend stack traces.
- Malformed model output is rejected and logged.
- Labeler cannot invoke assist for another labeler's assignment.
- Prefill updates the target answer and calls `onChange`.
- Existing answer is not overwritten without confirmation when mode requires confirmation.
- Read-only renderer does not invoke field-level assist.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_llm_field_assist.py tests/test_ai_review_agent.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/schema-renderer src/features/labeler
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

Use mocked/injected model calls for tests. Do not require live provider credentials for CI-style verification.

## Handoff Requirements

Create `docs/handoffs/<date>-task16-llm-field-loop-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Final `llm_trigger` JSON shape.
- Assist route request/response shape.
- Prompt context and output validation policy.
- Writeback behavior by mode.
- Provider configuration required for live calls.
- Tests/builds run and results.
- Any live-AI limitation that remains.

