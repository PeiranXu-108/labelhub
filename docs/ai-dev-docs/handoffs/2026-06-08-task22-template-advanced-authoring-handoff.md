## Agent Handoff

Agent: Template Advanced Authoring Agent
Task file: docs/tasks/22-template-advanced-authoring-agent.md
Status: ready for review

Changed files:
- backend/app/schemas/template.py
- backend/tests/test_template_schema.py
- frontend/src/features/owner/TemplateWorkspace.test.tsx
- frontend/src/features/owner/TemplateWorkspace.tsx
- frontend/src/features/schema-renderer/index.ts
- frontend/src/features/template/TemplateAdvancedEditors.tsx
- frontend/src/features/template/TemplateDesigner.test.tsx
- frontend/src/features/template/TemplateDesigner.tsx
- frontend/src/features/template/TemplatePropertyInspector.tsx
- frontend/src/features/template/templateDesignerModel.ts
- frontend/src/styles.css

Verification run:
- `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_submission_validation.py tests/test_llm_field_assist.py -q`: pass, 30 tests; existing passlib `crypt` deprecation warning and existing Pydantic alias warning.
- `cd frontend && npm test -- --run src/features/template src/features/schema-renderer src/features/owner/TemplateWorkspace.test.tsx`: pass, 40 tests.
- `cd frontend && npm test -- --run`: pass, 87 tests; existing React Router future-flag warnings.
- `cd frontend && npm run build`: pass; existing Vite large-chunk warning.
- `git diff --check`: pass.
- Browser smoke: in-app Browser `iab` was unavailable in this session; fallback Playwright with system Chrome passed on `http://127.0.0.1:5173/owner/tasks/<temp-task-id>` using temporary SQLite data. Verified the template workspace renders, inspector advanced tabs are visible, and the LLM target-field dropdown includes `Summary (summary)` while excluding `Raw text (raw_text)`. Temporary frontend/backend servers were stopped after the smoke.

Contract changes:
- No backend API shape changes.
- `frontend/src/features/schema-renderer/index.ts` now exports existing advanced schema TypeScript types for authoring consumers.
- Added backend regression coverage proving the advanced authoring JSON shape remains accepted by existing `TemplateDocument` validation.
- LLM trigger temperature is now server-side allowlisted to `0`, `0.2`, `0.7`, and `1`; direct API payloads such as `temperature: 0.1` are rejected.
- LLM trigger `targetFieldId` authoring now reuses `answerableFields(fields)`, so display-only `show_item` fields are not offered in the target dropdown.
- Visibility rules now have backend graph validation matching the frontend guard: self-references and cycles such as A -> B -> A are rejected.

Blockers:
- none

Requests for Supervisor:
- Review Task22 UI coverage and confirm whether Schema JSON export should remain browser-download only or also copy to clipboard in a later task.

Authorable validation types:
- `required`
- `min_length`
- `max_length`
- `min`
- `max`
- `regex` with safe-regex subset and `i` flag only
- `compare`
- `custom` limited to `no_whitespace_edges`, `non_empty_json_object`, and `https_url`

Authorable visibility operators:
- `equals`
- `not_equals`
- `in`
- `not_in`
- `contains`
- `not_contains`
- `is_empty`
- `is_not_empty`
- Backend validation rejects visibility self-references and cyclic source -> target dependency graphs.

Layout behavior:
- Owners can switch between `single`, `group`, and `tabs` layouts.
- Group/tab layouts can add/remove groups, edit group ID/title/description, and assign fields.
- Unassigned fields remain ungrouped; the existing SchemaRenderer renders them in the ungrouped area or fallback tab.
- Deleting or renaming fields cleans layout references so stale IDs are not retained.

LLM trigger authoring coverage:
- `promptTemplate`
- `targetFieldId`
- `mode`: `suggest`, `prefill`, `overwrite_with_confirmation`
- `outputSchema.preset`: `target_field`, `text`, `number`, `json_object`, `json_array`
- `contextFields`
- whitelisted `temperature`: `0`, `0.2`, `0.7`, `1`
- No provider credentials, API keys, model secrets, or server-side provider settings are exposed in frontend code.

Schema JSON export behavior:
- Owner template workspace now includes `导出 Schema JSON`.
- Export serializes the current in-memory schema with formatted JSON and downloads `template-schema-v<version>.json`.
- Export does not call draft/publish APIs and does not mutate published schema state.

UI consistency notes:
- The existing designer grid, panel density, Ant Design controls, and Studio visual language were preserved.
- The inspector moved from a flat form to Ant Design tabs: `基础`, `验证`, and `联动`.
- CSS changes are limited to compact tab/rule-card spacing and responsive no-overflow behavior for the new controls.
