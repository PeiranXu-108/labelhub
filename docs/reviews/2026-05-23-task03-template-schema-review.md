## Supervisor Feedback

Agent: Template Agent
Decision: needs changes

What is good:
- Template schema models cover discriminated field types, option validation, unique field ids, `show_item` source validation, and `llm_trigger`/`llmTools` target-field references.
- Published template versions are not mutated in place; publishing a changed draft creates a new immutable version.
- Submission save/submit now calls server-side template validation before storing answer payloads.
- Renderer tests cover `show_item` display and required-field validation.
- Fresh verification passed for Task03 backend tests, full backend tests, frontend tests, frontend build, and OpenAPI JSON syntax.

Required changes:
- Add the formal Task03 handoff under `docs/handoffs/` with a `## Agent Handoff` block. It must include changed files, verification run, contract changes, blockers, requests for Supervisor, final template JSON shape, versioning behavior, renderer props contract, backend model assumptions, package manager/dependency notes, and downstream contracts.
- Fix the template draft API request-body contract before downstream frontend work continues. The route accepts/tests use `{"schema": ...}` (`backend/app/api/routes/templates.py:41` and `backend/tests/test_template_schema.py:48`), but current generated OpenAPI advertises required `template_schema` (`frontend/src/api/openapi.json:1483`). Align the runtime route, tests, and OpenAPI snapshot on one frozen field name, preferably `schema`, then regenerate/check `frontend/src/api/openapi.json`.
- Document the cross-module change to `backend/app/services/submissions.py` in the handoff because Task03 extended Task02-owned submission behavior. Downstream Labeler/Reviewer Frontend and AI Review agents need to know submission payloads are now schema-validated and may return `INVALID_SUBMISSION_PAYLOAD`.

Verification:
- `cd backend && ./.venv313/bin/pytest tests/test_template_schema.py`: pass, 4 passed.
- `cd backend && ./.venv313/bin/pytest -q`: pass, 19 passed.
- `cd frontend && npm test -- --run`: pass, 8 passed.
- `cd frontend && npm run build`: pass.
- `python -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-openapi-check-task03.json`: pass.
- OpenAPI contract spot-check: current app schema still exposes `template_schema` for `POST /tasks/{task_id}/template/draft`, which conflicts with the tested `schema` request body.

Status board update:
- Task03 moved from ready to dispatch to review needs changes.
- Added Task03 verification evidence and integration risks for missing handoff and template draft request-body contract mismatch.

Next step:
- Return to Template Agent to add the Task03 handoff and align the template draft request-body contract/OpenAPI snapshot before dispatching Task04 or frontend agents that depend on templates.
