# Known Limitations

## Verified Limitations

- Docker runtime startup was verified by Task19 on 2026-05-31 with Docker Desktop 29.5.2 and Docker Compose v5.1.3. The verified stack is still an MVP runtime, not a hardened production deployment.
- The frontend Docker service uses the Vite development server for demonstration. It should be replaced by a static production build/server before internet exposure.
- The Celery worker currently runs as root in the container and emits Celery's `ROOT_DISCOURAGED` security warning.
- Compose uses local named volumes `export-storage` and `upload-storage` for API/worker shared storage. This fixes Docker-local visibility, but it is not a backup, retention, or object storage strategy.
- Task reward rules are metadata only. LabelHub does not execute payouts, maintain a payout ledger, handle tax/payment settlement, or integrate with external payment providers.
- Username/password login is implemented only as MVP JWT auth for explicitly seeded users. There is no self-registration, password reset, email verification, OAuth, SSO, refresh-token rotation, or production account lifecycle policy.
- Demo users are created by `backend/scripts/seed_e2e_data.py demo-users`; normal API authentication rejects bearer tokens whose subject is not a persisted user.
- Owner dashboard aggregate counts for submission status and AI decisions are not backed by a dedicated aggregate endpoint.
- Uploaded file/image materials use MVP filesystem storage. Upload/download permission checks are server-side, but there is no antivirus scanning, DLP, content moderation, automatic retention, legal hold, or automatic cleanup guarantee.

## Environment Blockers

- No live AI provider call was verified in Task19 because no safe `LABELHUB_LLM_API_KEY` was provided. Live review and field-level assist remain credential- and policy-gated.
- Without `LABELHUB_LLM_API_KEY`, AI review uses a controlled missing-credentials fallback and routes to human review; field-level assist returns a controlled `LLM_PROVIDER_UNAVAILABLE` path.
- Plain `docker compose config` expands local `.env` values and can print secrets. Use `env LABELHUB_LLM_API_KEY= docker compose config --quiet` for safe validation logs.
- Full Playwright E2E against the local SQLite smoke setup is green as of the 2026-06-09 rerun, including Redis-absent export creation plus synchronous export helper completion. The smoke now runs Playwright workers serially because both specs share one seeded SQLite backend. Full Playwright E2E against the live Docker worker is still not green because the deterministic helper flow is separate from the live worker runtime.

## Production Policy Gaps

- Data retention and privacy policy are not defined; do not use this MVP with sensitive production datasets until that policy is decided.
- Dataset import preview supports JSON arrays, JSONL, and `.xlsx` files up to configured row/file limits, but sensitive-data handling and retention remain undecided.
- Field-level LLM assist stores prompt snapshots, model metadata, structured responses, and failure reasons in `llm_field_assist_logs`. Do not use live assist with sensitive production data until retention and privacy policy are decided.
- Live AI review stores prompt snapshots, model metadata, structured responses, and failure metadata. Provider, region, retention, redaction, and audit policy need an owner decision before production use.
- Upload storage needs a production object storage, scanning, retention, and deletion policy before production file/image collection.
- Authentication needs a production identity and account lifecycle policy before exposing the app to non-demo users.
- Multistage review staffing, escalation, and SLA policy are product decisions; the MVP implements initial review, re-review, and final review mechanics only.

## Feature/Test Blockers

- `cd frontend && npm run e2e` against Docker runtime failed in Task19 because `labelhub-happy-path.spec.ts` expects deterministic seeded AI review/export helper behavior, while the live Docker worker consumes queued jobs with the configured runtime behavior.
- Local deterministic E2E remains the supported smoke path when backend/frontend share the same SQLite database and the deterministic AI helper is used.
- Export storage is production-local by default. Use durable volume policy or object storage before treating exports as production records.
- Upload cleanup is manual for the MVP; deleting database rows does not automatically delete files.
