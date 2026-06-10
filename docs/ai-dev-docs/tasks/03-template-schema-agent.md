# Task 03: Template Schema Agent

## Mission

Implement the dynamic annotation template system: schema definition, server validation, schema versioning, and renderer/designer contracts.

This agent owns template correctness. It must prevent published schemas from being mutated in place.

## Dependencies

- Task 01 for scaffold and base enums.
- Can run in parallel with Task 02 after agreeing on `TemplateSchema` model fields.

## Owned Areas

- `backend/app/schemas/template.py`
- `backend/app/services/templates.py`
- `backend/app/api/routes/templates.py`
- `frontend/src/features/template/*`
- `frontend/src/features/schema-renderer/*`

## Expected Deliverables

- Pydantic schema models for template fields.
- Server-side template validation.
- Template draft save and publish endpoints.
- Schema versioning behavior.
- Frontend schema renderer contract.
- Basic template designer UI modules if frontend scaffold is ready.

## Supported MVP Field Types

- `show_item`
- `text`
- `textarea`
- `number`
- `radio`
- `checkbox_group`
- `select`
- `rating`
- `json`
- `llm_trigger`

## Implementation Steps

- [ ] Define Pydantic field models with discriminated unions.
- [ ] Validate stable `field.id` uniqueness.
- [ ] Validate options for option-based fields.
- [ ] Validate `show_item.source` path format.
- [ ] Validate `llm_trigger` fields include prompt template and target behavior.
- [ ] Implement submission answer validation against schema.
- [ ] Implement template draft save endpoint.
- [ ] Implement template publish endpoint that increments version and locks the published snapshot.
- [ ] Add frontend `SchemaRenderer` that renders all MVP field types.
- [ ] Add frontend `TemplateDesigner` MVP:
  - component palette
  - field list/canvas
  - property inspector
  - preview mode
- [ ] Ensure server revalidates submissions and does not trust frontend validation.

## Required Tests

- Duplicate field IDs are rejected.
- Radio/select without options is rejected.
- Required field missing in submission is rejected.
- Published schema cannot be modified in place.
- Publishing a changed draft creates a new version.
- Renderer displays `show_item` from item payload.
- Renderer validates required field before submit.

## Verification Commands

```bash
cd backend && pytest tests/test_template_schema.py
cd frontend && npm run build
```

## Handoff Requirements

Report:

- final template JSON shape
- versioning behavior
- renderer props contract
- any backend model assumptions required from Task 02

