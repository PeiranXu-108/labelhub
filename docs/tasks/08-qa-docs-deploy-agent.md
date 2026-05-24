# Task 08: QA Docs Deploy Agent

## Mission

Verify the integrated LabelHub MVP and prepare the project for demonstration, handoff, and deployment.

This agent owns cross-module validation, docs, E2E smoke tests, Docker Compose readiness, and demo script.

## Dependencies

- First vertical slice from tasks 01-07.
- Task 09 Review Integration Contracts if Supervisor dispatched it to close reviewer/template API gaps.

## Owned Areas

- `README.md`
- `docs/api.md`
- `docs/demo-script.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `tests/e2e/` or `frontend/e2e/`
- Docker Compose final validation

## Expected Deliverables

- End-to-end Playwright smoke test.
- Backend integration test summary.
- README with local startup.
- API documentation.
- Architecture diagram.
- Demo script for 5-10 minute presentation.
- Docker Compose deployment guide.

## E2E Happy Path

```text
login as owner
create task
import items
build and publish template
publish task
login as labeler
claim item
submit annotation
run AI review worker or mocked review
login as reviewer
approve submission
login as owner
export JSONL
download export
```

## Implementation Steps

- [ ] Add E2E seed data script.
- [ ] Add Playwright config if missing.
- [ ] Write happy-path E2E test.
- [ ] Add Docker Compose startup documentation.
- [ ] Write `docs/api.md` from OpenAPI route list.
- [ ] Write `docs/architecture.md` with module boundaries and data flow.
- [ ] Write `docs/demo-script.md`.
- [ ] Write `docs/deployment.md`.
- [ ] Run backend tests.
- [ ] Run frontend build/tests.
- [ ] Run E2E smoke test.
- [ ] Record known limitations.
- [ ] Confirm Task09 is approved or explicitly marked out of MVP scope before documenting reviewer/template gaps as limitations.

## Required Verification Commands

```bash
cd backend && pytest
cd frontend && npm run build
cd frontend && npm test -- --run
docker compose config
```

If full Docker startup is available:

```bash
docker compose up --build
```

## Handoff Requirements

Report:

- commands run and results
- E2E test status
- deployment status
- known limitations
- demo script location
- unresolved blockers requiring user decision
