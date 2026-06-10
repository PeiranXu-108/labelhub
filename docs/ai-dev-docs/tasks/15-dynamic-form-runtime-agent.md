# Task 15: Dynamic Form Runtime Agent

## Mission

Implement the advanced dynamic form runtime that the schema model already hints at but the renderer does not execute: conditional visibility, linked validation, regex validation, safe custom validators, and multi-tab/group layouts.

This task owns runtime semantics and backend validation parity. It must not rely on frontend-only validation for correctness.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/15-dynamic-form-runtime-agent.md`
- Current `SchemaRenderer` and `validateAnswers` in `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- Current schema types in `frontend/src/features/schema-renderer/types.ts`
- Current backend template schema and submission validation in `backend/app/schemas/template.py` and submission services.

## Dependencies

- Task 03 template schema is approved.
- Task 13 designer builder should be approved before exposing full authoring controls.
- Task 14 is optional but must be coordinated if rich-media fields also need advanced validation.

## Owned Areas

- `backend/app/schemas/template.py`
- Backend submission validation helpers/services.
- Backend tests for dynamic schema validation.
- `frontend/src/features/schema-renderer/types.ts`
- `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- Renderer tests.
- Designer controls under `frontend/src/features/template/` only if Task 13 has landed or Supervisor assigns this task to add authoring controls.
- `docs/handoffs/<date>-task15-dynamic-form-runtime-handoff.md`

## Non-Owned Areas

- AI model execution.
- Upload storage implementation.
- Workflow transition rules except validation failures that already prevent submit.

## Required Schema Semantics

Implement support for:

- `visibilityRules`
  - conditions compare a source field value to literals or set membership.
  - hidden fields are not required.
  - hidden field answer retention policy is explicit: retain but ignore for validation, or clear on hide.
- `validations`
  - required validation.
  - string `minLength` and `maxLength`.
  - number `min` and `max`.
  - regex validation with safe regex limits.
  - cross-field comparison such as field A equals/not equals/greater than field B.
  - named custom validators from a server-approved registry.
- `layout`
  - single-page layout remains supported.
  - group layout renders field groups with headings.
  - tab layout renders multiple tabs and keeps validation errors discoverable.

Arbitrary user-authored JavaScript or Python must not execute from template JSON without explicit Supervisor/user approval.

## Required Frontend Behavior

- Renderer evaluates visibility rules during answer changes.
- Renderer validates visible answerable fields before submit.
- Renderer displays field-specific and form-level validation errors.
- Renderer supports group and tab layouts responsively.
- Preview mode in designer uses the same runtime semantics.

## Required Backend Behavior

- Backend validates the schema structure for visibility rules, validations, and layouts.
- Backend validates submitted answers using the same semantics as the frontend.
- Backend rejects unsupported custom validator names.
- Backend prevents catastrophic regex behavior by constraining pattern length/flags or using a safe strategy.

## Implementation Steps

- [ ] Define backend Pydantic models for visibility rules, validations, and layout groups/tabs.
- [ ] Implement backend answer validation parity for required, regex, cross-field, and named custom validators.
- [ ] Update frontend schema types to match backend schema.
- [ ] Implement renderer rule evaluation and layout rendering.
- [ ] Update `validateAnswers` tests for visible/hidden fields, regex, cross-field validation, and tabs/groups.
- [ ] Add backend tests for schema validation and submission validation parity.
- [ ] Update designer controls if assigned in this task; otherwise document Task 13/15 integration point in handoff.
- [ ] Regenerate OpenAPI if backend schemas changed.
- [ ] Create the standard handoff.

## Required Tests

- Hidden required field does not block submit.
- Visible required field blocks submit.
- Regex validation accepts matching input and rejects non-matching input.
- Cross-field validation rejects inconsistent answers.
- Unsupported custom validator name is rejected by backend schema validation.
- Tab layout renders all groups and exposes validation errors outside the current tab.
- Backend rejects the same invalid payload that frontend blocks.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_submission_validation.py -q
cd backend && ./.venv313/bin/pytest -q
cd backend && ./.venv313/bin/python scripts/export_openapi.py
python -m json.tool frontend/src/api/openapi.json
cd frontend && npm test -- --run src/features/schema-renderer src/features/template
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

If `tests/test_submission_validation.py` does not exist yet, create it for backend dynamic-form validation coverage.

## Handoff Requirements

Create `docs/handoffs/<date>-task15-dynamic-form-runtime-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Final rule/validation/layout JSON shapes.
- Hidden answer retention policy.
- Custom validator registry and safety policy.
- Regex safety constraints.
- Backend/frontend parity test coverage.
- OpenAPI regeneration result.
- Tests/builds run and results.
- Designer controls implemented or deferred.

