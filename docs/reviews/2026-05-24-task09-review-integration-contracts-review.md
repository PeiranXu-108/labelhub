## Supervisor Feedback

Agent: Review Integration Contracts Agent
Decision: needs changes

What is good:
- Backend contracts now expose frozen submission template snapshots from `submission.template_schema_id` on labeler assignment and reviewer detail responses.
- Review queue now returns `ReviewQueueItemRead[]` with latest AI/human review summaries and server-backed `task_id`, `status`, `ai_decision`, `min_score`, and `max_score` filters.
- Review detail now returns structured AI reviews, human reviews, persisted audit logs, frozen template schema, and previous submitted attempt snapshots.
- Submitted attempt history is persisted through `SubmissionService.submit_assignment(...)` while preserving `WorkflowService.transition_submission(...)` for workflow state mutation.
- Frontend labeler and reviewer surfaces consume the expanded backend contracts instead of inventing local review metadata.

Required changes:
- Add a formal Task09 handoff under `docs/handoffs/`, for example `docs/handoffs/2026-05-24-task09-review-integration-contracts-handoff.md`.
- The handoff must include an exact `## Agent Handoff` block and enumerate changed files, route/response-shape changes, migration name, attempt-history behavior, OpenAPI regeneration result, backend/frontend verification results, package-manager/dependency changes if any, downstream impacts for Task08, blockers, and requests for Supervisor.
- The handoff must explicitly confirm whether any labeler or reviewer frontend route still relies on a mutable current task template instead of the submission snapshot.
- The handoff must separate Task09-owned changes from pre-existing Task07/Supervisor documentation changes in the current working tree, because the workspace contains mixed uncommitted files.

Verification:
- `find docs/handoffs -maxdepth 1 -type f -name '*task09*' -print`: no Task09 handoff found.
- `cd backend && ./.venv313/bin/pytest tests/test_labeler_api.py tests/test_review_api.py tests/test_review_integration_contracts.py -q`: pass, 8 tests, 1 existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 40 tests, 1 existing Pydantic alias warning.
- `cd backend && ./.venv313/bin/python scripts/export_openapi.py`: pass, regenerated `frontend/src/api/openapi.json`.
- `python -m json.tool frontend/src/api/openapi.json`: pass.
- `cd frontend && npm test -- --run src/features/labeler/LabelerWorkspace.test.tsx src/features/reviewer/ReviewerWorkspace.test.tsx`: pass, 2 files and 8 tests, with React Router future-flag warnings.
- `cd frontend && npm test -- --run`: pass, 7 files and 22 tests, with React Router future-flag warnings.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `docker compose config`: pass.
- `cd backend && env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_task09_review.sqlite ./.venv313/bin/alembic upgrade head`: pass, including revision `20260524_0002`.
- `git diff --check`: pass.

Status board update:
- Task09 is marked `needs changes` until its formal handoff is present and reviewable.
- Task08 QA Docs Deploy remains blocked on Task09 approval.
- Integration risk is reduced at implementation level but still open at process/coordination level because the downstream handoff is missing.

Next step:
- Return to the Review Integration Contracts Agent to add the formal Task09 handoff. After that, Supervisor should re-review the handoff and, if it matches the verified implementation, approve Task09 and dispatch Task08.
