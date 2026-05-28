# LabelHub Demo Script

Target length: 5-10 minutes.

## Setup

Start the stack:

```bash
docker compose up --build
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

For local non-Docker demo, run backend migrations and start both servers.

Backend terminal:

```bash
cd backend
./.venv313/bin/alembic upgrade head
./.venv313/bin/python scripts/seed_e2e_data.py demo-users
./.venv313/bin/uvicorn app.main:app --reload
```

Frontend terminal:

```bash
cd frontend
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Demo credentials:

- Owner: `owner@example.com` / `LabelHubOwner123!`
- Labeler: `labeler@example.com` / `LabelHubLabeler123!`
- Reviewer: `reviewer@example.com` / `LabelHubReviewer123!`

Sign in through `http://localhost:5173/login` when switching roles. The app stores the returned JWT at `labelhub.accessToken`; backend dependencies still enforce role permissions for business routes.

## 1. Owner

1. Sign in as `owner@example.com`.
2. Open `http://localhost:5173/owner/tasks`.
3. Create a task named `Support Quality Review`.
4. Import one or more items with payload text, for example a support ticket.
5. Open the task detail page.
6. Build a template with:
   - `show_item` field for `item.payload.text`
   - required `radio` field for sentiment
   - required `textarea` field for summary
7. Publish the template.
8. Configure AI review criteria and thresholds.
9. Publish the task.

Talk track: the owner controls the production contract: task metadata, raw items, immutable template versions, and review/export configuration.

## 2. Labeler

1. Log out, then sign in as `labeler@example.com`.
2. Open `http://localhost:5173/labeler/tasks`.
3. Claim the published task.
4. Fill the annotation form.
5. Submit the annotation.

Talk track: the labeler renders the frozen template snapshot assigned at claim/submission time. Frontend validation helps, but backend validation is authoritative.

## 3. AI Review

For a deterministic demo without live LLM credentials, run:

```bash
cd backend
./.venv313/bin/python scripts/seed_e2e_data.py ai-review <submission_id>
```

For live AI review, configure `LLM_API_KEY` and related provider settings, then run the Celery worker.

Talk track: AI review is a system actor. Structured review output, score, model metadata, prompt snapshot, and workflow transition metadata are persisted.

## 4. Reviewer

1. Log out, then sign in as `reviewer@example.com`.
2. Open `http://localhost:5173/review/queue`.
3. Filter by task, AI decision, or score range.
4. Open the submission detail page.
5. Inspect the original item, frozen template, answers, AI review, audit timeline, and previous attempts.
6. Approve the submission.

Talk track: the reviewer sees persisted AI/human/audit context, not frontend-invented state.

## 5. Export

1. Log out, then sign in again as `owner@example.com`.
2. Open the task export area.
3. Create a JSONL export with review metadata.
4. If no worker is running locally, run the export synchronously for demo:

```bash
cd backend
./.venv313/bin/python scripts/seed_e2e_data.py run-export <export_job_id>
```

5. Download the export file and show the approved answer plus review metadata.

Talk track: exports are limited to approved/exportable submissions and support JSON, JSONL, CSV, and XLSX.
