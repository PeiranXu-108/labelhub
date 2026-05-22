# Task 07: Labeler and Reviewer Frontend Agent

## Mission

Implement the labeler workbench and reviewer workspace. This includes task marketplace, schema-rendered annotation, draft autosave, submit flow, review queue, submission detail, approve/return, and batch operations.

## Dependencies

- Task 01 frontend scaffold.
- Task 02 labeler/reviewer APIs.
- Task 03 `SchemaRenderer`.

## Owned Areas

- `frontend/src/features/labeler/`
- `frontend/src/features/reviewer/`
- `frontend/src/features/schema-renderer/` consumption only unless coordinated with Task 03
- `frontend/src/routes/labeler/*`
- `frontend/src/routes/review/*`

## Expected Deliverables

- Labeler task marketplace.
- Assignment workbench.
- Draft autosave.
- Submit validation and error display.
- Returned submission revision view.
- Reviewer queue.
- Reviewer detail page with AI scores, prompt snapshot, diff, timeline.
- Approve/return/batch actions.

## Implementation Steps

- [ ] Implement labeler task marketplace with search/filter.
- [ ] Implement claim action.
- [ ] Implement assignment workbench:
  - item payload display
  - schema-rendered answer form
  - previous/next navigation if assignments exist
  - draft autosave
  - submit action
- [ ] Show returned review comments and previous attempt information.
- [ ] Implement reviewer queue with filters:
  - task
  - AI decision
  - status
  - score range
- [ ] Implement submission detail:
  - raw item payload
  - answer payload
  - AI scores and comments
  - prompt snapshot
  - audit timeline
  - previous attempts diff
- [ ] Implement approve action.
- [ ] Implement return action with required reason.
- [ ] Implement batch approve/return.

## Required Tests

- Marketplace renders published tasks.
- Claim button creates assignment and navigates to workbench.
- Draft autosave calls API after answer changes.
- Submit blocks when required fields are missing.
- Review return blocks without reason.
- Approve changes visible status.

## Verification Commands

```bash
cd frontend && npm run build
cd frontend && npm test -- --run
```

## Handoff Requirements

Report:

- route list
- API endpoints consumed
- schema renderer assumptions
- autosave debounce behavior
- screenshots or browser validation notes if UI was rendered

