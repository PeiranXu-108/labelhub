# Task 07 Labeler/Reviewer Frontend Review

## Supervisor Feedback

Agent: Labeler and Reviewer Frontend Agent
Decision: needs changes

What is good:
- Formal Task07 handoff is present at `docs/handoffs/2026-05-24-task07-labeler-reviewer-frontend-handoff.md` and includes routes, consumed endpoints, schema renderer assumptions, autosave debounce behavior, browser validation notes, contract limitations, blockers, and Supervisor requests.
- Implementation stayed in the assigned frontend labeler/reviewer route and feature areas, with only route/style wiring outside those areas.
- Labeler workbench consumes `SchemaRenderer` rather than duplicating template validation, and backend still revalidates drafts/submits.
- Draft save, submit, approve, return, and batch review actions call backend APIs; Task07 did not modify backend workflow state directly.
- Missing backend contracts for historical template snapshots, AI metadata, AI score filters, and previous-attempt diffs are surfaced as limitations instead of being silently fabricated.

Required changes:
- Do not synthesize audit timeline records in the frontend. `frontend/src/features/reviewer/ReviewSubmissionDetail.tsx` lines 72-87 insert a `local-*` audit entry after return. Audit records are a frozen business/audit contract and must come from persisted backend data. After a successful return, refresh `GET /audit?entity_type=submission&entity_id={submission_id}` or reload the detail, and add a regression test that return success does not display a locally fabricated audit event.
- Keep the handoff blockers open: versioned template snapshot reads, review detail AI metadata/human review comments/previous attempts, and server-backed AI decision/score filters require a backend/Supervisor contract before a frontend agent implements active behavior.

Verification:
- `cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx`: pass, 2 files / 6 tests, with React Router future-flag warnings.
- `cd frontend && npm test -- --run`: pass, 7 files / 20 tests, with React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `python -m json.tool frontend/src/api/openapi.json`: pass.
- `git diff --check`: pass.

Status board update:
- Marked Task07 as reviewed with changes required.
- Added integration risk for frontend-synthesized audit timeline records.
- Added open decisions for versioned template snapshot and richer reviewer metadata/filter contracts.
- Recorded Task07 verification results.

Next step:
- Return Task07 to the Labeler/Reviewer Frontend Agent. Fix the audit timeline to use persisted backend audit data only, then re-run frontend tests/build and request re-review before QA Docs Deploy starts full E2E coverage.
