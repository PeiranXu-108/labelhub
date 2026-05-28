# Known Limitations

- Username/password login is implemented only as MVP JWT auth for explicitly seeded users. There is no self-registration, password reset, email verification, OAuth, SSO, refresh-token rotation, or production account lifecycle policy.
- Demo users are created by `backend/scripts/seed_e2e_data.py demo-users`; normal API authentication rejects bearer tokens whose subject is not a persisted user.
- Live AI review requires provider credentials. Without `LLM_API_KEY`, AI review falls back to a persisted failed review routed to human review.
- Local E2E signs into `/login` for frontend route checks and still uses `backend/scripts/seed_e2e_data.py ai-review` for deterministic structured AI review output.
- Owner dashboard aggregate counts for submission status and AI decisions are not backed by a dedicated aggregate endpoint.
- Data retention and privacy policy are not defined; do not use this MVP with sensitive production datasets until that policy is decided.
- The frontend Docker service uses Vite dev server for MVP demonstration, not a hardened static production server.
- Export storage is local filesystem storage by default. Use a durable volume or object storage adapter before production use.
