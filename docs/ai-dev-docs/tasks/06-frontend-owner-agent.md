# Task 06: Owner Frontend Agent

## Mission

Implement the task owner user experience: task management, dataset import, template designer, review configuration, progress dashboard, and export center.

This agent should consume backend/API contracts. It should not invent conflicting API shapes.

## Dependencies

- Task 01 frontend scaffold.
- Task 02 task/review/export API contracts.
- Task 03 template contract.

## Owned Areas

- `frontend/src/features/owner/`
- `frontend/src/features/template/` UI pieces coordinated with Task 03
- `frontend/src/features/export/`
- `frontend/src/routes/owner/*`

## Expected Deliverables

- Owner task list.
- Create/edit task drawer.
- Task detail dashboard.
- Dataset import UI.
- Template designer page.
- Review config editor.
- Export center.

## Implementation Steps

- [ ] Create owner route layout.
- [ ] Implement task list table:
  - status
  - item count
  - progress
  - deadline
  - actions
- [ ] Implement create/edit task drawer.
- [ ] Implement task status actions:
  - publish
  - pause
  - end
- [ ] Implement dataset import form.
- [ ] Integrate `TemplateDesigner`.
- [ ] Implement review config editor:
  - prompt template
  - scoring criteria
  - thresholds
  - model settings
- [ ] Implement result dashboard:
  - submission status counts
  - AI decision counts
  - export CTA
- [ ] Implement export center:
  - format selection
  - field mapping
  - include review metadata
  - job history
  - download link

## Required Tests

- Task list renders fetched tasks.
- Create task submits expected payload.
- Publish action calls correct endpoint.
- Review config editor validates criteria.
- Export form creates job with expected mapping.

## Verification Commands

```bash
cd frontend && npm run build
cd frontend && npm test -- --run
```

## Handoff Requirements

Report:

- route list
- API endpoints consumed
- any API contract mismatch
- screenshots or browser validation notes if UI was rendered

