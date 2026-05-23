# Task 06 Owner Frontend Review

## Supervisor Feedback

Agent: Owner Frontend Agent
Decision: needs changes

What is good:
- Implementation stayed in frontend owner/export/template UI surfaces: `frontend/src/features/owner/`, `frontend/src/features/export/`, `frontend/src/routes/owner/`, plus route/test/style wiring.
- Owner console consumes the frozen backend routes for tasks, dataset import, review config, template draft/publish, and export job creation/listing without changing backend contracts.
- Required frontend verification passes: task list fetch, task creation payload, publish endpoint, review config validation, export job payload, app routing, build, and OpenAPI JSON parsing.
- Workflow state mutation remains behind backend APIs; Task06 does not write backend workflow state directly.
- Published template immutability and structured AI review contracts were not modified.

Required changes:
- Add the formal Task06 handoff under `docs/handoffs/` with a `## Agent Handoff` block. It must include changed files, verification run, route list, API endpoints consumed, API contract mismatches or limitations, screenshots/browser validation notes if rendered, blockers, and requests for Supervisor.
- Fix or explicitly contract the export download action in `frontend/src/features/export/ExportCenter.tsx`. The current link at line 127 uses `href={`/exports/${record.id}/download`}`, which bypasses `VITE_API_BASE_URL` and cannot attach the Bearer token used by `frontend/src/features/owner/api.ts`. Since the backend export download endpoint is protected, this will fail in separated frontend/backend deployments or any bearer-token-only auth setup. Use the same API base/auth path, for example a fetch-blob download helper, or document and test a same-origin authenticated proxy/session mechanism.

Verification:
- `cd frontend && npm test -- --run`: pass, 5 files / 13 tests.
- `cd frontend && npm run build`: pass, with existing Vite chunk-size warning.
- `git diff --check`: pass.
- `python -m json.tool frontend/src/api/openapi.json`: pass.
- `find docs/handoffs -maxdepth 1 -type f -name '*task06*' -print`: no output; formal Task06 handoff is missing.

Status board update:
- Marked Task06 as reviewed with changes required.
- Added integration risks for missing Task06 handoff and export download auth/base URL mismatch.
- Recorded Task06 verification results.

Next step:
- Return Task06 to the Owner Frontend Agent. Do not dispatch Task07 until the formal handoff is added and the export download contract is fixed or explicitly documented and tested.
