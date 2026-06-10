## Agent Handoff

Agent: LLM Field Loop Agent
Task file: docs/tasks/16-llm-field-loop-agent.md
Status: ready for review

Changed files:
- backend/alembic/versions/20260531_0006_llm_field_assist_logs.py
- backend/app/agent/providers.py
- backend/app/agent/schemas.py
- backend/app/api/routes/labeler.py
- backend/app/models/__init__.py
- backend/app/schemas/llm_assist.py
- backend/app/schemas/template.py
- backend/app/services/llm_field_assist.py
- backend/tests/test_llm_field_assist.py
- frontend/src/api/openapi.json
- frontend/src/features/labeler/LabelerWorkbench.tsx
- frontend/src/features/schema-renderer/SchemaRenderer.test.tsx
- frontend/src/features/schema-renderer/SchemaRenderer.tsx
- frontend/src/features/schema-renderer/types.ts
- docs/api.md
- docs/demo-script.md
- docs/known-limitations.md
- docs/handoffs/2026-05-31-task16-llm-field-loop-handoff.md

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_llm_field_assist.py tests/test_ai_review_agent.py -q`: pass, 15 tests, existing passlib `crypt` deprecation warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 108 tests, existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python -m json.tool frontend/src/api/openapi.json`: not run successfully because this host has no `python` executable on PATH.
- `python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task16-openapi-python3-json-check.json`: pass.
- `cd frontend && npm test -- --run src/features/schema-renderer src/features/labeler`: pass, 2 files and 20 tests, existing React Router future-flag warnings.
- `cd frontend && npm test -- --run`: pass, 10 files and 71 tests, existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass, existing Vite chunk-size warning.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task16_migration.sqlite ./.venv313/bin/alembic upgrade head`: pass through `20260531_0006`.
- `git diff --check`: pass.

Contract changes:
- Extended `llm_trigger` with `mode`, `outputSchema`, `contextFields`, and whitelisted `temperature`.
- Added `POST /labeler/assignments/{assignment_id}/llm-assist`.
- Added persisted `llm_field_assist_logs` and submission audit event `llm_field_assist`.
- Regenerated OpenAPI snapshot.

Blockers:
- none

Requests for Supervisor:
- Review Task 16 contract and confirm whether future reviewer-side field assist should be a separate route/mode.

Final `llm_trigger` JSON shape:

```json
{
  "id": "assist_summary",
  "type": "llm_trigger",
  "label": "Generate summary",
  "promptTemplate": "Summarize {{item.payload.text}} using {{answers.sentiment}}.",
  "targetFieldId": "summary",
  "mode": "suggest | prefill | overwrite_with_confirmation",
  "outputSchema": {
    "preset": "target_field | text | number | json_object | json_array",
    "jsonSchema": { "type": "string", "maxLength": 500 }
  },
  "contextFields": ["sentiment"],
  "temperature": 0
}
```

Defaults: `mode` is `suggest`, `outputSchema.preset` is `target_field`, `contextFields` is empty, and `temperature` uses server-side provider defaults. `targetFieldId` must point to an answerable field; `contextFields` must point to existing non-`llm_trigger` fields.

Assist route request/response:

```http
POST /labeler/assignments/{assignment_id}/llm-assist
```

```json
{
  "trigger_field_id": "assist_summary",
  "answer_payload": {
    "sentiment": "positive",
    "summary": "current draft value"
  }
}
```

```json
{
  "log_id": "assist-log-id",
  "trigger_field_id": "assist_summary",
  "target_field_id": "summary",
  "mode": "prefill",
  "status": "succeeded",
  "value": "Suggested field value",
  "rationale": "Optional model rationale",
  "confidence": 0.91,
  "model_name": "deepseek-chat",
  "created_at": "2026-05-31T00:00:00Z"
}
```

Prompt context and output validation policy:
- Prompt context uses the frozen template snapshot, current item payload, current answers, target field metadata, trigger config, and optional `contextFields`.
- Prompt templates support `{{item.payload...}}`, `{{answers.field_id}}`, and `{{answers}}` interpolation. Unknown placeholders resolve empty.
- Model output must validate as the structured envelope `{ value, rationale?, confidence? }`.
- `value` is then validated against the trigger `outputSchema` preset/JSON Schema subset and the backend target field type. Malformed envelopes return `LLM_FIELD_OUTPUT_INVALID`; invalid target values return `LLM_FIELD_VALUE_INVALID`.

Writeback behavior:
- `suggest`: displays the structured suggestion and does not call `onChange`.
- `prefill`: writes returned `value` to `target_field_id` and calls `onChange`, so labeler autosave can persist it.
- `overwrite_with_confirmation`: if the target already has a value, shows a confirmation before writeback; empty targets are filled directly.
- Read-only renderings disable the trigger and do not invoke the endpoint.

Provider configuration and test evidence:
- Live field assist reuses server-side `LABELHUB_LLM_PROVIDER`, `LABELHUB_LLM_MODEL`, `LABELHUB_LLM_BASE_URL`, `LABELHUB_LLM_API_KEY`, and `LABELHUB_LLM_TEMPERATURE`.
- Per-trigger `temperature` is the only template-level model option currently whitelisted.
- Missing credentials return controlled `LLM_PROVIDER_UNAVAILABLE` and persist a failed assist log.
- Tests use injected/mock model dependencies and never require live provider credentials.
