# Task 13: Template Designer Builder Agent

## Mission

Upgrade the template designer from click-to-add fields plus a minimal label inspector into a drag-and-drop builder with a practical field palette, canvas ordering, layout controls, and a real property inspector.

This task owns template authoring UX. It must preserve the published template schema contract and server-side validation rules.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/13-template-designer-builder-agent.md`
- `docs/tasks/03-template-schema-agent.md`
- Current `frontend/src/features/template/TemplateDesigner.tsx`
- Current renderer/types in `frontend/src/features/schema-renderer/`
- Current backend template schemas in `backend/app/schemas/template.py`

## Dependencies

- Task 03 template schema is approved.
- Task 06 owner frontend is approved.
- Task 11 and Task 12 may run independently, but coordinate shared owner page layout edits.

## Owned Areas

- `frontend/src/features/template/TemplateDesigner.tsx`
- New designer subcomponents under `frontend/src/features/template/`
- `frontend/src/features/schema-renderer/types.ts` only for designer-facing type additions that match backend schema.
- `frontend/src/features/schema-renderer/` preview consumption only unless coordinated with Task 15.
- `backend/app/schemas/template.py` only for schema properties required by the builder and approved by Supervisor.
- Backend/frontend template tests.
- `docs/handoffs/<date>-task13-template-designer-builder-handoff.md`

## Non-Owned Areas

- Published template versioning behavior.
- Submission validation execution beyond schema property support.
- LLM execution behavior.
- Upload/storage behavior for file/image fields unless Task 14 is explicitly merged.

## Required Frontend Behavior

Template designer must provide:

- draggable field palette
- canvas drop target
- field reordering
- duplicate field
- delete field
- stable field ID editing with validation
- label/help/placeholder editing
- required toggle
- option editor for radio/checkbox/select fields
- rating min/max editor
- text min/max length editor
- number min/max editor
- `show_item.source` editor
- `llm_trigger` prompt and target-field editor
- layout/group placement editor if the current schema supports it, otherwise a clear disabled state tied to Task 15
- preview mode using `SchemaRenderer`

## Required Schema Behavior

- Designer must emit only schema payloads accepted by backend template validation.
- Field IDs must remain stable unless the owner explicitly edits them.
- Option values must be unique and non-empty.
- Required fields must be visible in preview and validation.
- Designer must not emit unsupported field types.

## Implementation Steps

- [ ] Split `TemplateDesigner` into palette, canvas, field card, property inspector, and preview components.
- [ ] Add drag-and-drop field creation and field reordering.
- [ ] Add field duplication and deletion with selected-field state updates.
- [ ] Add property editors for every existing MVP field type.
- [ ] Add frontend validation for field IDs, option values, and incompatible numeric ranges.
- [ ] Ensure generated schema passes backend template validation.
- [ ] Add template designer tests for drag/drop or the chosen accessible reorder fallback.
- [ ] Add tests for option editing, required toggle, ID validation, and preview rendering.
- [ ] Create the standard handoff.

## Required Tests

- Adding a field from the palette creates a valid schema field.
- Reordering fields changes schema order without changing field IDs.
- Editing label/help/placeholder/required updates schema output.
- Option fields reject duplicate option values.
- Deleting the selected field selects a stable neighbor or clears selection.
- Preview mode renders the current schema.
- Designer output can be submitted to backend template validation.

## Verification Commands

```bash
cd frontend && npm test -- --run src/features/template src/features/schema-renderer
cd frontend && npm test -- --run
cd frontend && npm run build
cd backend && ./.venv313/bin/pytest tests/test_template_schema.py -q
git diff --check
```

If drag-and-drop requires browser-level coverage, add the smallest Playwright or Testing Library coverage that proves reorder behavior and report the exact command.

## Handoff Requirements

Create `docs/handoffs/<date>-task13-template-designer-builder-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Final designer component structure.
- Drag-and-drop library or native approach used.
- Property inspector coverage by field type.
- Schema validation behavior before save/publish.
- Any unsupported layout/visibility controls deferred to Task 15.
- Tests/builds run and results.
- Backend schema changes, if any.

