# Known Limitations

- Supervisor follow-up Tasks 15-19 document expanded requirements that are not implemented yet: dynamic form rules/layouts, field-level LLM assist, labeler navigation, multistage review, and production runtime verification.
- Task reward rules are metadata only. LabelHub does not execute payouts, maintain a payout ledger, handle tax/payment settlement, or integrate with external payment providers.
- Username/password login is implemented only as MVP JWT auth for explicitly seeded users. There is no self-registration, password reset, email verification, OAuth, SSO, refresh-token rotation, or production account lifecycle policy.
- Demo users are created by `backend/scripts/seed_e2e_data.py demo-users`; normal API authentication rejects bearer tokens whose subject is not a persisted user.
- Live AI review requires provider credentials. Without `LLM_API_KEY`, AI review falls back to a persisted failed review routed to human review.
- Field-level LLM assist is not implemented yet. `llm_trigger` follow-through is tracked by Task 16 and must keep model calls server-side.
- Local E2E signs into `/login` for frontend route checks and still uses `backend/scripts/seed_e2e_data.py ai-review` for deterministic structured AI review output.
- Owner dashboard aggregate counts for submission status and AI decisions are not backed by a dedicated aggregate endpoint.
- Data retention and privacy policy are not defined; do not use this MVP with sensitive production datasets until that policy is decided.
- Dataset import preview supports JSON arrays, JSONL, and `.xlsx` files up to the configured row/file limits, but data retention and sensitive-data handling remain undecided.
- Uploaded file/image materials use MVP local filesystem storage only. Upload/download permission checks are server-side, but there is no production object storage adapter, antivirus scanning, DLP, content moderation, automatic retention, or cleanup guarantee.
- The frontend Docker service uses Vite dev server for MVP demonstration, not a hardened static production server.
- Full Docker runtime startup must not be treated as verified unless `docker compose up --build` has actually run in a Docker-enabled environment. Current Supervisor follow-up tracks that evidence gap in Task 19.
- Export storage is local filesystem storage by default. Use a durable volume or object storage adapter before production use.
