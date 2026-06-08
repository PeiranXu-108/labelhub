# Task 26: Production Policy and Readiness Agent

## Mission

Turn the remaining production blockers from documented limitations into explicit product and engineering readiness requirements. This task does not blindly harden production by guessing policy; it prepares or implements only decisions that are approved and testable.

This task should not modify feature UI unless a readiness policy needs a small admin/config surface. Keep all UI changes consistent with existing Studio components.

## Required Reading

- `docs/technical-solution.md`
- `docs/agent-coordination.md`
- `docs/status-board.md`
- `docs/tasks/26-production-policy-readiness-agent.md`
- `docs/tasks/19-production-readiness-agent.md`
- `README.md`
- `docs/deployment.md`
- `docs/demo-script.md`
- `docs/known-limitations.md`
- `docker-compose.yml`
- `scripts/production_preflight.sh`
- `backend/app/core/config.py`
- `backend/app/core/security.py`
- `backend/app/storage/local.py`
- `backend/app/agent/config.py`

## Dependencies

- Tasks 19 and 20 are complete.
- Task 26 can start after Supervisor confirms which readiness policies are in scope for this iteration.

## Owned Areas

- Production policy requirement documentation.
- Readiness preflight checks and deployment documentation.
- Minimal backend/frontend changes required by approved readiness policies.
- Tests for implemented policy checks.
- `docs/handoffs/<date>-task26-production-policy-readiness-handoff.md`

## Non-Owned Areas

- New product features unrelated to production readiness.
- Payment execution unless explicitly approved as a separate product scope.
- Full enterprise identity provider implementation unless explicitly approved.
- Live provider calls with real secrets unless the user supplies safe credentials and approves the test.

## Required Functional Scope

### Production Identity Policy

- Decide and document whether the next step is:
  - stronger demo-user-only guardrails
  - production username/password lifecycle
  - OAuth/SSO integration
  - external identity provider integration
- Do not implement self-registration, password reset, refresh-token rotation, OAuth, or SSO without explicit user approval.
- If implemented, add tests for account lifecycle and token behavior.

### Live AI Provider Readiness

- Define live provider verification steps that do not commit secrets.
- Keep missing-key fallback behavior intact.
- Add preflight checks for provider configuration if approved.
- Do not expose provider keys or model controls in frontend UI.

### Storage, Scanning, Retention, and Cleanup

- Decide and document production storage target:
  - local volume retained as demo-only
  - object storage
  - external storage adapter
- Define upload scanning/DLP/content moderation requirements.
- Define retention, deletion, legal hold, and cleanup requirements for uploads, imports, prompt snapshots, AI responses, exports, and audit logs.
- Implement only the approved minimal policy hooks.

### Docker / Worker / E2E Readiness

- Decide whether Docker-mode Playwright E2E must be made green or remains a limitation.
- If in scope, align Docker worker behavior with E2E expectations without weakening live-worker semantics.
- Resolve or document the worker root-user warning.
- Keep `scripts/production_preflight.sh` secret-safe.

### Dashboard Aggregate Endpoint Policy

- If Task 21 does not already close it, define whether owner dashboard submission/AI aggregate endpoints are required for production readiness.
- Avoid duplicating Task 21 implementation; document the dependency instead.

### Reward / Payout Policy

- Keep reward rules metadata-only unless the user explicitly approves payout execution.
- If payout execution is requested later, split it into a separate task with ledger, provider, tax, and audit requirements.

## Implementation Steps

- [ ] Convert each current known limitation into one of: accepted limitation, policy decision needed, implementation requirement, or out-of-scope.
- [ ] Update `docs/known-limitations.md`, `docs/deployment.md`, and `README.md` with the resulting readiness stance.
- [ ] Add preflight checks only for approved and locally testable requirements.
- [ ] Add backend tests for any implemented policy hooks.
- [ ] Run Docker/Compose checks when available; otherwise document exact blockers.
- [ ] Create a handoff that separates implemented readiness fixes from policy decisions still awaiting the user.

## Required Tests

- Tests depend on approved scope. At minimum:
  - existing backend suite must remain green
  - existing frontend suite/build must remain green if frontend files are touched
  - `scripts/production_preflight.sh` must remain secret-safe
  - Compose config validation must not print secrets
- If any policy hook is implemented, add targeted tests for it.

## Verification Commands

```bash
cd backend && ./.venv313/bin/pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh
git diff --check
```

If Docker runtime or live AI is in scope and credentials/environment are available, also run the exact runtime/live verification commands documented in the handoff.

## Handoff Requirements

Create `docs/handoffs/<date>-task26-production-policy-readiness-handoff.md` with the standard `## Agent Handoff` block.

Also report:

- production identity decision status
- live AI verification status
- storage/scanning/retention decision status
- Docker-mode E2E status
- worker hardening status
- reward/payout policy status
- accepted limitations that remain intentionally documented
