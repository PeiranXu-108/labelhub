# Task 19: Production Readiness and Runtime Verification Agent

## Mission

Close the remaining production-readiness gaps honestly: live AI depends on external credentials, Docker runtime has not been verified in the current environment, and deployment limitations must be either resolved or clearly documented with executable checks.

This task owns runtime verification, deployment hardening notes, and production readiness evidence. It must not claim support that was not actually verified.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/19-production-readiness-agent.md`
- `README.md`
- `docs/deployment.md`
- `docs/demo-script.md`
- `docs/known-limitations.md`
- `docker-compose.yml`
- Current backend/frontend environment configuration.

## Dependencies

- Task 08 QA/docs/deploy is approved.
- Task 10 auth login is approved.
- Task 16 should be approved before validating field-level live AI behavior.
- Tasks 11-18 do not all need to be complete before this task starts, but final readiness cannot be declared for features that are still pending.

## Owned Areas

- `README.md`
- `docs/deployment.md`
- `docs/demo-script.md`
- `docs/known-limitations.md`
- `docs/status-board.md` only when acting under Supervisor direction.
- Docker Compose and environment sample files if corrections are needed.
- Backend/frontend smoke scripts under `scripts/`, `backend/scripts/`, or `frontend/e2e/` if needed.
- CI or local verification scripts if the repo already has a suitable pattern.
- `docs/handoffs/<date>-task19-production-readiness-handoff.md`

## Non-Owned Areas

- Feature semantics for tasks, templates, review, export, or auth unless a smoke test exposes a production blocker and Supervisor assigns a targeted fix.
- Live provider secrets. Do not write real secrets to the repo.

## Required Runtime Checks

Perform and record:

- `command -v docker` availability.
- `docker compose config`.
- `docker compose up --build` or the closest available runtime startup if Docker is installed.
- backend health check inside the chosen runtime.
- frontend route load in the chosen runtime.
- worker startup or documented blocker.
- Redis/Postgres connectivity in Compose.
- export storage path write/read check.
- live AI preflight:
  - provider env vars present or absent
  - model endpoint call only if the user provides safe credentials for the environment
  - controlled fallback behavior when credentials are absent

If Docker is not installed, do not mark Docker runtime verified. Document the exact blocker and provide the command that must be run in an environment with Docker.

## Required Documentation Updates

- Known limitations must clearly distinguish:
  - verified limitations
  - environment blockers
  - production policy gaps
  - feature tasks still pending
- Deployment docs must list required env vars, secret handling, storage paths, and startup commands.
- Demo script must state whether it uses mocked AI, missing-key fallback, or live AI.
- README must not promise Docker runtime startup unless it was actually verified.

## Implementation Steps

- [ ] Check Docker CLI availability and record result.
- [ ] Run Docker Compose config validation.
- [ ] If Docker is available, run Compose runtime startup and smoke checks.
- [ ] If Docker is unavailable, update docs/status with exact blocker and reproducible commands for a Docker-enabled host.
- [ ] Add or update a production preflight script if it reduces ambiguity without hardcoding secrets.
- [ ] Validate live-AI fallback with no key and live-AI call only if safe credentials are available.
- [ ] Update known limitations, deployment docs, demo script, and README to match evidence.
- [ ] Create the standard handoff.

## Required Tests

- Docker config validates.
- Runtime smoke succeeds when Docker is available, or the exact missing Docker blocker is recorded.
- Backend tests pass.
- Frontend tests/build pass.
- E2E smoke passes when runtime dependencies are available.
- AI provider missing-key path remains controlled and documented.

## Verification Commands

```bash
command -v docker
docker compose config
docker compose up --build
cd backend && ./.venv313/bin/pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
cd frontend && npm run e2e
git diff --check
```

Run only the commands supported by the local environment. For unsupported commands, record the exact shell error and the closest verified alternative.

## Handoff Requirements

Create `docs/handoffs/<date>-task19-production-readiness-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- Docker availability result and runtime status.
- Compose config/startup evidence.
- Backend/frontend/worker smoke evidence.
- E2E evidence or blocker.
- Live AI preflight status and whether calls were mocked, fallback, or live.
- Docs updated.
- Remaining production blockers and owner decisions.

