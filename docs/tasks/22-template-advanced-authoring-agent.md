# Task 22: Template Advanced Authoring Agent

## Mission

Expose the advanced template behavior already supported by the runtime through a coherent owner-facing authoring experience: validation rules, field linkage, group/tab layouts, LLM trigger options, and Schema JSON export.

This task is functional authoring work, not a redesign. Keep the current template designer layout, component density, and Studio visual system intact.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/22-template-advanced-authoring-agent.md`
- `docs/tasks/13-template-designer-builder-agent.md`
- `docs/tasks/15-dynamic-form-runtime-agent.md`
- `docs/tasks/16-llm-field-loop-agent.md`
- `frontend/src/features/template/TemplateDesigner.tsx`
- `frontend/src/features/template/TemplateDesignerCanvas.tsx`
- `frontend/src/features/template/TemplateFieldPalette.tsx`
- `frontend/src/features/template/TemplatePropertyInspector.tsx`
- `frontend/src/features/template/templateDesignerModel.ts`
- `frontend/src/features/schema-renderer/types.ts`
- `frontend/src/features/schema-renderer/SchemaRenderer.tsx`
- `frontend/src/features/owner/TemplateWorkspace.tsx`
- `backend/app/schemas/template.py`
- `backend/app/services/templates.py`

## Dependencies

- Tasks 13, 15, and 16 are complete.
- Task 22 must not run in parallel with another task editing `frontend/src/features/template/` or `frontend/src/features/schema-renderer/`.

## Owned Areas

- Template designer advanced authoring controls.
- Frontend schema-builder model helpers for runtime rules, layout groups/tabs, validations, and LLM trigger properties.
- Owner template workspace actions for preview and Schema JSON export.
- Focused frontend tests and backend validation regression tests if authoring exposes new serialized shapes.
- OpenAPI snapshot only if backend schema contracts change.
- `docs/handoffs/<date>-task22-template-advanced-authoring-handoff.md`

## Non-Owned Areas

- Backend runtime semantics unless parity bugs are found in existing validation.
- Field-level LLM service behavior owned by Task 16.
- Labeler runtime form rendering unless required to verify an authoring contract.
- Broad UI restyling of the designer.

## Required Functional Scope

### Property Inspector Tabs

- Replace the current single flat inspector with functional tabs for:
  - basic field settings
  - validation rules
  - linkage/visibility rules
- The tabs should use existing Ant Design tab styling and current panel dimensions.

### Validation Authoring

- Allow owners to author supported runtime validations:
  - required
  - min/max length
  - min/max numeric value
  - safe regex with allowed flags
  - compare against another field
  - server-approved custom validators
- The designer must validate the same safe regex subset and named custom validator allowlist already enforced by the backend.
- Invalid authoring state must block draft save/publish and show a concrete issue.

### Field Linkage / Visibility Authoring

- Allow owners to create, edit, and remove visibility rules:
  - target field
  - source field
  - operator
  - comparison value when required
- Prevent cyclic or impossible references where the existing runtime contract cannot safely represent them.
- Rules must serialize to `visibilityRules` without inventing a new schema shape.

### Layout Authoring

- Replace the disabled layout selector with actual single/group/tabs controls.
- Allow adding/removing groups, editing group title/description, and assigning fields to groups.
- Preserve ungrouped-field behavior already supported by `SchemaRenderer`.

### LLM Trigger Authoring

- Expose LLM trigger properties supported by Task 16:
  - mode
  - output schema preset
  - context fields
  - whitelisted temperature
  - target field
  - prompt template
- Do not expose provider credentials, model API keys, or server secret settings.

### Template Workspace Actions

- Add a Schema JSON export action matching the screenshot requirement.
- Add a preview action if the current inline preview mode is insufficient for the owner workflow.
- Continue to use backend draft/publish APIs; published schema immutability must not be weakened.

## Implementation Steps

- [ ] Add focused tests that demonstrate the current missing authoring controls.
- [ ] Extend `TemplatePropertyInspector` into basic/validation/linkage tabs.
- [ ] Add validation rule editor helpers in `templateDesignerModel.ts`.
- [ ] Add visibility rule editor helpers in `templateDesignerModel.ts`.
- [ ] Add layout group/tab editor controls and serialization.
- [ ] Add full LLM trigger property controls.
- [ ] Add Schema JSON export in `TemplateWorkspace`.
- [ ] Run backend template validation tests to prove emitted JSON remains backend-valid.
- [ ] Update handoff with final authoring coverage and any unsupported runtime shape.

## Required Tests

- Frontend tests for:
  - adding regex validation and seeing it serialized to `validations`
  - rejecting unsafe regex before save/publish
  - adding a visibility rule and seeing it serialized to `visibilityRules`
  - creating group and tab layouts
  - editing LLM trigger mode/output schema/context fields
  - exporting Schema JSON
- Backend tests only if the authoring work reveals a mismatch with backend `TemplateDocument` validation.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_submission_validation.py tests/test_llm_field_assist.py -q
cd frontend && npm test -- --run src/features/template src/features/schema-renderer src/features/owner/TemplateWorkspace.test.tsx
cd frontend && npm test -- --run
cd frontend && npm run build
git diff --check
```

## Handoff Requirements

Create `docs/handoffs/<date>-task22-template-advanced-authoring-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- final authorable validation types
- final authorable visibility operators
- layout authoring behavior and ungrouped-field handling
- LLM trigger authoring coverage
- Schema JSON export behavior
- UI consistency notes confirming no broad redesign was introduced
