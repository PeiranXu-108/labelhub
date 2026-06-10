# Render Demo Deployment

This document describes the Render demo deployment for LabelHub.

## Current Render Plan

The active Blueprint uses Render Hobby/free-compatible resources:

- `labelhub-demo-api`: Docker web service for FastAPI.
- `labelhub-demo-frontend`: static Vite/React site.
- `labelhub-demo-db`: Render Postgres.
- `labelhub-demo-redis`: Render Key Value.

The Blueprint intentionally does not create a background worker because the
current Render plan reports that `worker` services are not available.

## Deploy

1. Commit and push the latest `render.yaml` and `backend/scripts/start_render.sh`.
2. Open the existing Render Blueprint.
3. Click **Manual sync**.
4. Wait for these resources to complete:
   - `labelhub-demo-db`
   - `labelhub-demo-redis`
   - `labelhub-demo-api`
   - `labelhub-demo-frontend`

The API starts with:

```bash
./scripts/start_render.sh
```

That script runs migrations and then starts Uvicorn on Render's `$PORT`.

## Verify

API health:

```bash
curl https://labelhub-demo-api.onrender.com/health
```

Expected:

```json
{"status":"ok"}
```

Frontend:

```text
https://labelhub-demo-frontend.onrender.com/login
```

If the frontend cannot call the API, check these Render environment variables:

- `labelhub-demo-frontend`: `VITE_API_BASE_URL=https://labelhub-demo-api.onrender.com`
- `labelhub-demo-api`: `LABELHUB_CORS_ORIGINS=["https://labelhub-demo-frontend.onrender.com"]`

If Render assigns different service names or domains, update both values and
redeploy.

## Seed Demo Users

Open the `labelhub-demo-api` service in Render, then use **Shell** or a
one-off job to run:

```bash
python scripts/seed_e2e_data.py demo-users
```

Demo accounts:

- Owner: `owner@example.com` / `LabelHubOwner123!`
- Labeler: `labeler@example.com` / `LabelHubLabeler123!`
- Reviewer: `reviewer@example.com` / `LabelHubReviewer123!`

## Demo Limitations On This Plan

- There is no always-on Celery worker on the current Render plan.
- Labeler submissions can enqueue AI review tasks, but no worker will consume
  them unless a worker service is added on a plan that supports background
  workers.
- For a deterministic AI review demo, use the API service shell:

```bash
python scripts/seed_e2e_data.py ai-review <submission_id>
```

- For export jobs that remain pending, use the API service shell:

```bash
python scripts/seed_e2e_data.py run-export <export_job_id>
```

- Upload/export storage is local to the API container. Treat the Render demo as
  a temporary evaluation environment, not production storage.

## Failure Notes

The first Render sync failed for two independent reasons:

- API exited with status 127 because the old `dockerCommand` used nested shell
  quotes. Render passed the quoted command as a single executable name.
- Worker creation failed because the current Render plan does not support
  background worker services.

Both issues are addressed by the current Blueprint.
