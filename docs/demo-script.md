# LabelHub Demo Script

Target length: 5-10 minutes.

## Setup

Start the stack:

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

This default Docker demo intentionally uses missing-key AI fallback: no live provider call is made, AI review routes to human review when the worker cannot call the model, and field-level assist returns a controlled provider-unavailable response. To show live AI, export `LABELHUB_LLM_API_KEY` and provider settings from a secret source before startup.

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
   - Add rich task instructions such as `Read the full conversation before labeling.`
   - Add tags such as `support qa, demo`.
   - Set a metadata-only reward rule, for example fixed accepted submission reward `USD 1.25` or manual `USD`.
   - Add one quality rule such as `Evidence: cite the support ticket text`.
4. Import one or more items with payload text, for example a support ticket.
   - Paste a JSON array for the fastest path:
     `[{ "external_id": "ticket-1", "payload": { "text": "Customer asks for refund status." } }]`
   - Or upload `.jsonl` / `.xlsx`, generate a preview, remove invalid rows, edit `external_id` or payload cells, and then commit the valid rows.
5. Open the task detail page.
6. Build a template with:
   - `show_item` field for `item.payload.text`
   - required `radio` field for sentiment
   - required `textarea` field for summary
   - optional `llm_trigger` field targeting `summary` with `mode: suggest`, `prefill`, or `overwrite_with_confirmation`
7. Publish the template.
8. Configure AI review criteria and thresholds.
9. Publish the task.

Talk track: the owner controls the production contract: rich task instructions, normalized tags, metadata-only reward policy, raw items, immutable template versions, and review/export configuration. Dataset import supports JSON arrays, JSONL, and first-sheet XLSX previews with backend-authoritative validation before commit. Reward rules are policy metadata in this MVP, not payout execution.

## 2. Labeler

1. Log out, then sign in as `labeler@example.com`.
2. Open `http://localhost:5173/labeler/tasks`.
3. Review the task instructions, tags, and reward policy shown in the marketplace, then claim the published task.
4. Fill the annotation form.
5. If the template includes an LLM trigger, click the assist control:
   - `suggest` shows a structured suggestion without changing the answer.
   - `prefill` writes the returned value into the target field and triggers autosave.
   - `overwrite_with_confirmation` asks before replacing an existing answer.
6. Submit the annotation.

Talk track: the labeler renders the frozen template snapshot assigned at claim/submission time. Field-level LLM assist calls the backend, not the browser, and returns structured `{ value, rationale, confidence }` output before any target-field writeback. Frontend validation helps, but backend validation is authoritative.

## 3. AI Review

Default Docker demo without live LLM credentials:

- Labeler submission enqueues `ai_review.run_ai_review`.
- The worker starts, detects missing `LABELHUB_LLM_API_KEY`, persists controlled failure metadata, and routes the submission to human review.
- Field-level assist returns `LLM_PROVIDER_UNAVAILABLE`.

For a deterministic structured AI review demo without live LLM credentials, use the local non-Docker stack or stop/skip the Docker worker before labeler submission, then run:

```bash
cd backend
./.venv313/bin/python scripts/seed_e2e_data.py ai-review <submission_id>
```

For live AI review and field-level LLM assist, configure `LABELHUB_LLM_API_KEY` in an untracked `.env` or secret manager along with `LABELHUB_LLM_PROVIDER`, `LABELHUB_LLM_MODEL`, optional `LABELHUB_LLM_BASE_URL`, and optional `LABELHUB_LLM_TEMPERATURE`. AI review also requires the Celery worker. Labeler submission enqueues `ai_review.run_ai_review` automatically; the helper above is only for deterministic demos without live LLM credentials. Do not use live AI with sensitive demo data until retention and privacy policy are approved.

Talk track: AI review is a system actor. Structured review output, score, model metadata, prompt snapshot, and workflow transition metadata are persisted.

## 4. Reviewer

1. Log out, then sign in as `reviewer@example.com`.
2. Open `http://localhost:5173/review/queue`.
3. Filter by task, AI decision, review stage, or score range.
4. Open the submission detail page.
5. Inspect the original item, frozen template, answers, AI review, stage timeline, round diff, audit timeline, and previous attempts.
6. Approve the submission.

Talk track: human review is stage-aware. Initial returns, re-review returns, and terminal final approvals are persisted with round metadata, and round diffs come from stored submission-attempt snapshots rather than mutable current answers.

## 5. Export

1. Log out, then sign in again as `owner@example.com`.
2. Open the task export area.
3. Create a JSONL export with review metadata.
4. In Docker, the worker processes the export job and writes to the shared `export-storage` volume. If Redis/Celery is unavailable in the local smoke setup, export creation still returns a `pending` job instead of failing the request; run the export synchronously for demo:

```bash
cd backend
./.venv313/bin/python scripts/seed_e2e_data.py run-export <export_job_id>
```

5. Download the export file and show the approved answer plus review metadata.

Talk track: exports are limited to approved/exportable submissions and support JSON, JSONL, CSV, and XLSX.
