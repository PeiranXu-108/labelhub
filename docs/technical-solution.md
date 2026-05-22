# LabelHub Technical Solution

> This document is written for Codex-driven implementation. Treat it as the project-level technical contract. If a later task is ambiguous, Codex must stop and ask the user before changing scope, data contracts, workflow states, or AI behavior.

## 1. Goal

Build LabelHub, a full-stack data annotation platform for LLM/Agent training data production.

The platform must cover this lifecycle:

```text
Task creation -> Dynamic annotation template -> Labeler submission
-> AI pre-review Agent -> Human review -> Multi-format export
```

The product should prioritize an end-to-end demonstrable workflow over broad generality. It should feel like a realistic internal data-production tool, not a generic form demo.

## 2. Hard Requirements

- Backend language: Python.
- Agent module: LangChain + LangGraph.
- Frontend: selected by Codex based on implementation quality and speed.
- Must support three primary user roles: task owner, labeler, reviewer.
- AI Agent must behave as an auditable system actor with independent review records.
- Core workflow and state transitions must be traceable through audit logs.
- Dynamic template schema must be versioned. Published submissions must reference the schema version used at submission time.
- AI review output must be structured. Do not parse free-form LLM text as the source of truth.
- When product scope, LLM provider, deployment target, authentication policy, or data retention policy is unclear, ask the user.

## 3. Recommended Stack

### 3.1 Frontend

- React 18 + TypeScript + Vite.
- UI library: Ant Design or Semi Design.
- Form rendering: JSON Schema driven renderer first; optionally Formily if time allows.
- Drag and drop: `@dnd-kit/core`.
- State: Zustand.
- API client: generated or hand-written typed client using OpenAPI contracts.
- Tests: Vitest + React Testing Library + Playwright.

Reasoning: React/Vite is fast for Codex to scaffold and iterate. Ant Design/Semi Design provide dense admin-tool components, tables, forms, drawers, modals, and status tags that fit this project.

### 3.2 Backend

- Python 3.12+.
- API framework: FastAPI.
- Validation/contracts: Pydantic v2.
- ORM: SQLAlchemy 2.0.
- Migrations: Alembic.
- Database: PostgreSQL for production, SQLite only for lightweight local demo if the user asks.
- Background jobs: Celery + Redis, or Dramatiq + Redis. Default to Celery because it is widely documented and production-proven.
- File/object storage: local filesystem for MVP, S3-compatible storage for deployed version.
- Auth: JWT-based session for MVP. Keep role-based authorization in backend dependencies/services, not only in frontend route guards.
- Tests: pytest, pytest-asyncio, httpx test client, factory-boy or model factories.

Reasoning: FastAPI aligns well with Python type hints, Pydantic models, OpenAPI generation, async endpoints, and Codex-readable module boundaries.

### 3.3 Agent

- LangGraph for explicit review workflow orchestration.
- LangChain for model abstraction, tool definitions, structured output strategy, and provider integration.
- LLM provider: configurable. Default implementation should support OpenAI-compatible APIs and allow Doubao/Ark-compatible base URL if the user provides credentials.
- Observability: persist prompt, model name, raw structured response, token/cost metadata when available, decision, retry count, and failure reason.
- Optional tracing: LangSmith only if credentials are available; do not make it required.

Reasoning: LangGraph is the right fit because the AI review is a stateful, auditable, retryable workflow, not a one-off prompt call.

## 4. Architecture

```text
apps/web
  React admin and labeler UI

apps/api
  FastAPI HTTP API
  Auth, task, template, assignment, submission, review, export endpoints

apps/worker
  Celery worker
  AI review jobs
  Export jobs

packages/domain
  Shared Python domain models, enums, workflow transition rules

packages/agent
  LangGraph review graph
  Prompt builders
  Structured output schemas
  Provider adapters

packages/frontend-contracts
  Generated OpenAPI types or manually maintained TypeScript types
```

If a monorepo package system feels heavy during MVP, keep a simpler structure:

```text
backend/
  app/
    api/
    core/
    db/
    domain/
    models/
    schemas/
    services/
    workers/
    agent/
frontend/
  src/
docs/
```

Default choice: use the simpler `backend/` + `frontend/` layout first. It is easier for Codex to maintain and still leaves clean boundaries.

## 5. Domain Model

### 5.1 Users and Roles

Roles:

- `OWNER`: creates tasks, templates, review configs, export jobs.
- `LABELER`: claims items, drafts, submits, fixes returned submissions.
- `REVIEWER`: reviews AI-passed or AI-flagged submissions, approves or returns.
- `AI_AGENT`: system actor used in audit logs and review records.

Backend must enforce permissions on every mutating endpoint.

### 5.2 Task

Task fields:

- `id`
- `name`
- `description`
- `status`: `DRAFT | PUBLISHED | PAUSED | ENDED`
- `distribution_strategy`: `MANUAL | AUTO_CLAIM`
- `quota_per_labeler`
- `deadline_at`
- `created_by`
- `created_at`
- `updated_at`

Allowed task transitions:

```text
DRAFT -> PUBLISHED
PUBLISHED -> PAUSED
PAUSED -> PUBLISHED
PUBLISHED -> ENDED
PAUSED -> ENDED
```

Do not allow template mutation on a published task without creating a new schema version.

### 5.3 Template Schema

Template schema is the contract between designer and renderer.

Minimum schema shape:

```json
{
  "version": 1,
  "title": "Customer support quality labeling",
  "layout": {
    "type": "single",
    "groups": []
  },
  "fields": [
    {
      "id": "raw_text",
      "type": "show_item",
      "label": "Original text",
      "source": "item.payload.text"
    },
    {
      "id": "sentiment",
      "type": "radio",
      "label": "Sentiment",
      "required": true,
      "options": [
        { "label": "Positive", "value": "positive" },
        { "label": "Neutral", "value": "neutral" },
        { "label": "Negative", "value": "negative" }
      ]
    }
  ],
  "llmTools": [
    {
      "id": "summarize",
      "label": "Summarize",
      "promptTemplate": "Summarize this text: {{item.payload.text}}",
      "targetFieldId": "summary"
    }
  ],
  "validations": [],
  "visibilityRules": []
}
```

Supported MVP field types:

- `show_item`
- `text`
- `textarea`
- `number`
- `radio`
- `checkbox_group`
- `select`
- `rating`
- `json`
- `llm_trigger`

Schema rules:

- Every field must have a stable `id`.
- Stored submissions must include `template_schema_id` and `schema_version`.
- Renderer must validate required fields before submit.
- Server must revalidate submission payload. Frontend validation is not enough.

### 5.4 Items, Assignments, Submissions

`task_items` store raw data to annotate:

- `id`
- `task_id`
- `external_id`
- `payload` JSON
- `status`
- `created_at`

`assignments` store claim/ownership:

- `id`
- `task_id`
- `item_id`
- `labeler_id`
- `status`
- `claimed_at`
- `expires_at`

`submissions` store user answers:

- `id`
- `task_id`
- `item_id`
- `labeler_id`
- `template_schema_id`
- `schema_version`
- `answer_payload` JSON
- `status`
- `attempt`
- `submitted_at`
- `created_at`
- `updated_at`

Submission status:

```text
DRAFT
SUBMITTED
AI_REVIEWING
AI_PASSED
AI_RETURNED
NEEDS_HUMAN_REVIEW
HUMAN_REVIEWING
APPROVED
RETURNED
EXPORTABLE
```

### 5.5 Review Config

Task owner configures:

- `prompt_template`
- `criteria`: list of scoring dimensions
- `pass_threshold`
- `return_threshold`
- `manual_review_threshold`
- `model_name`
- `temperature`
- `max_retries`

Example criteria:

```json
[
  { "key": "relevance", "label": "Relevance", "maxScore": 5 },
  { "key": "accuracy", "label": "Accuracy", "maxScore": 5 },
  { "key": "format", "label": "Format compliance", "maxScore": 5 },
  { "key": "safety", "label": "Safety", "maxScore": 5 }
]
```

### 5.6 AI Review Output

Use Pydantic models as the structured output schema.

```python
class CriterionScore(BaseModel):
    key: str
    score: int = Field(ge=0, le=5)
    reason: str

class AIReviewDecision(str, Enum):
    PASS = "pass"
    RETURN = "return"
    HUMAN_REVIEW = "human_review"

class AIReviewResult(BaseModel):
    decision: AIReviewDecision
    overall_score: int = Field(ge=0, le=100)
    criterion_scores: list[CriterionScore]
    summary: str
    return_reasons: list[str] = []
    suggestions: list[str] = []
```

The database should store:

- normalized fields for filtering: `decision`, `overall_score`, `status`
- full structured response JSON
- prompt snapshot
- model metadata
- raw provider response if safe
- error metadata for failed runs

## 6. LangGraph Agent Design

The AI review should be modeled as a graph.

```text
START
  -> load_context
  -> build_prompt
  -> call_model
  -> validate_output
  -> decide_transition
  -> persist_review
  -> END

call_model error -> retry_or_fail
validate_output error -> retry_or_fail
retry_or_fail exhausted -> mark_needs_human_review -> END
```

Node responsibilities:

- `load_context`: load task, item payload, submission answer, schema snapshot, review config.
- `build_prompt`: render deterministic prompt from stored snapshots. Do not read mutable task/template fields directly after this point.
- `call_model`: invoke LLM through LangChain model abstraction.
- `validate_output`: parse into `AIReviewResult`.
- `decide_transition`: map decision and thresholds to next submission status.
- `persist_review`: write `ai_reviews`, update `submissions`, append `audit_logs`.
- `retry_or_fail`: retry only idempotent model calls; never duplicate persisted review records.

Persistence:

- Use LangGraph checkpointer for graph state when practical.
- Also persist business-level records in application tables. Do not rely on LangGraph checkpoints as the only audit trail.

Idempotency:

- Each AI review job must have an idempotency key: `submission_id + attempt`.
- Before starting, check whether a completed review already exists for that key.
- On retry, update the same job/run record or create a clear retry child record.

Human fallback:

- Any malformed structured output, provider timeout, provider error, or max retry exhaustion must transition the submission to `NEEDS_HUMAN_REVIEW`, not silently fail.

## 7. API Design

Minimum endpoint groups:

```text
POST   /auth/login
GET    /auth/me

GET    /tasks
POST   /tasks
GET    /tasks/{task_id}
PATCH  /tasks/{task_id}
POST   /tasks/{task_id}/publish
POST   /tasks/{task_id}/pause
POST   /tasks/{task_id}/end

POST   /tasks/{task_id}/items/import
GET    /tasks/{task_id}/items

GET    /tasks/{task_id}/template
POST   /tasks/{task_id}/template/draft
POST   /tasks/{task_id}/template/publish

GET    /labeler/tasks
POST   /labeler/tasks/{task_id}/claim
GET    /labeler/assignments/{assignment_id}
PUT    /labeler/assignments/{assignment_id}/draft
POST   /labeler/assignments/{assignment_id}/submit
GET    /labeler/submissions

GET    /review/queue
GET    /review/submissions/{submission_id}
POST   /review/submissions/{submission_id}/approve
POST   /review/submissions/{submission_id}/return
POST   /review/submissions/batch

GET    /tasks/{task_id}/review-config
PUT    /tasks/{task_id}/review-config

POST   /tasks/{task_id}/exports
GET    /tasks/{task_id}/exports
GET    /exports/{export_id}/download

GET    /audit?entity_type=&entity_id=
```

API rules:

- All mutating endpoints append audit logs.
- All workflow endpoints use a shared transition service.
- Controllers should be thin. Business rules live in service/domain modules.
- Return API errors with stable codes such as `INVALID_TRANSITION`, `PERMISSION_DENIED`, `SCHEMA_VERSION_LOCKED`.

## 8. Frontend Product Surfaces

### 8.1 App Shell

Routes:

```text
/login
/owner/tasks
/owner/tasks/:id
/owner/tasks/:id/template
/owner/tasks/:id/review-config
/owner/tasks/:id/exports
/labeler/tasks
/labeler/workbench/:assignmentId
/labeler/submissions
/review/queue
/review/submissions/:id
```

App shell should show role switch only in development/demo mode. In real auth mode, role comes from backend.

### 8.2 Owner Console

Must support:

- Task list with status, progress, deadline, item count.
- Create/edit task drawer.
- Import dataset.
- Template designer:
  - left component palette
  - center canvas
  - right property inspector
  - preview mode
  - save draft
  - publish schema version
- Review config editor:
  - prompt template
  - criteria
  - thresholds
  - model settings
- Result dashboard:
  - counts by status
  - AI pass/return/manual-review distribution
  - export CTA

### 8.3 Labeler Workbench

Must support:

- Task marketplace.
- Claim next item.
- Render schema using item payload and template snapshot.
- Auto-save draft with debounce.
- Previous/next item navigation.
- Submit validation.
- Show returned review comments.
- Trigger field-level LLM helper only when configured.

### 8.4 Reviewer Workspace

Must support:

- Review queue filters: task, AI decision, status, score range.
- Submission detail:
  - raw item payload
  - labeler answer
  - AI scores and comments
  - prompt snapshot
  - previous attempts and diff
  - audit timeline
- Approve/return with required reason for return.
- Batch approve/return.

### 8.5 Export Center

Must support:

- Format: JSON, JSONL, CSV, Excel.
- Field mapping:
  - include raw item fields
  - include answer fields
  - rename output columns
  - include/exclude review metadata
- Async job status.
- Download history.

## 9. Workflow Transition Service

Create one backend service responsible for all state changes.

Pseudo-interface:

```python
class WorkflowService:
    def transition_submission(
        self,
        submission_id: UUID,
        action: SubmissionAction,
        actor: ActorContext,
        reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Submission:
        ...
```

Rules:

- Validate current status and action.
- Validate actor role.
- Update submission status transactionally.
- Write audit log in the same transaction.
- Return the updated entity.

Do not let API handlers, Celery tasks, or Agent nodes update workflow status directly.

## 10. Export Design

Export is a background job.

Flow:

```text
Owner creates export job
-> worker queries approved/exportable submissions
-> applies field mapping
-> writes file
-> updates export job status
-> owner downloads file
```

Formats:

- JSON: array of records.
- JSONL: one record per line.
- CSV: flat columns only; nested JSON should be stringified unless explicitly mapped.
- Excel: one primary sheet plus optional review metadata sheet.

Export records should include stable identifiers:

- task id/name
- item id/external id
- submission id
- labeler id/name
- schema version
- answer fields
- review decision/status

## 11. Testing Strategy

### 11.1 Backend Unit Tests

Required:

- workflow transition matrix
- permission checks
- schema validation
- export field mapping
- AI structured output validation
- idempotency behavior

### 11.2 Backend Integration Tests

Required flows:

```text
owner creates task -> imports items -> publishes template -> publishes task
labeler claims -> drafts -> submits
worker runs AI review -> reviewer approves
owner exports JSONL
```

### 11.3 Frontend Tests

Required:

- template designer can add/edit fields
- renderer validates required fields
- labeler submit flow
- review approve/return flow
- export job creation form

### 11.4 E2E Tests

Use Playwright for one happy path:

```text
login as owner
create task and template
login as labeler
submit item
run/observe AI pre-review
login as reviewer
approve
login as owner
export
```

## 12. Security and Safety

- Never expose LLM API keys to frontend.
- Store provider credentials in environment variables or secret manager.
- Redact secrets in logs.
- Prompt templates should not allow arbitrary tool execution.
- Agent tools must be explicit and minimal.
- Review prompt should include raw data and answer snapshots, not database access tools.
- User-uploaded files must be size-limited.
- Export download must check task ownership/permission.
- Audit logs must not be editable from normal API routes.

## 13. Observability

Log:

- request id
- actor id/role
- entity ids
- workflow transition
- worker job id
- AI run id
- model name
- latency
- retry count

Metrics to expose later:

- submissions per status
- AI pass/return/manual-review rate
- average review latency
- export job success/failure
- model error rate

## 14. Implementation Phases

### Phase 1: Foundation

- Backend FastAPI app.
- SQLAlchemy models and Alembic migrations.
- Auth and role dependencies.
- Workflow enums and transition service.
- Frontend app shell and route guards.

Deliverable: users can log in and see role-specific shells.

### Phase 2: Task and Dataset

- Task CRUD.
- Task status transitions.
- Dataset import.
- Item list/progress stats.

Deliverable: owner can create a task, import items, publish/pause/end.

### Phase 3: Template Designer and Renderer

- Schema model.
- Designer MVP.
- Renderer MVP.
- Server-side schema validation.
- Schema version publish.

Deliverable: owner can build a template; labeler UI can render it.

### Phase 4: Labeler Workbench

- Task marketplace.
- Claim assignment.
- Draft autosave.
- Submit validation.
- Returned submission editing.

Deliverable: labeler can complete the full submit/modify loop.

### Phase 5: AI Review Agent

- Review config.
- Celery AI review job.
- LangGraph review graph.
- Structured output schema.
- AI review records.
- Failure fallback to human review.

Deliverable: submitted data automatically receives an auditable AI decision.

### Phase 6: Human Review

- Review queue.
- Submission detail with AI review.
- Approve/return.
- Batch operations.
- Audit timeline.

Deliverable: reviewer can approve or return submissions.

### Phase 7: Export

- Export config UI.
- Background export worker.
- JSON/JSONL/CSV/Excel writers.
- Download history.

Deliverable: owner can export approved data.

### Phase 8: Polish and Submission

- README.
- API documentation.
- Architecture diagram.
- Demo script.
- Deployment guide.
- E2E smoke test.

Deliverable: project is ready for final presentation.

## 15. Codex Development Rules

Codex must follow these rules during implementation:

- Before coding a phase, inspect existing files and preserve current patterns.
- Add tests around workflow/state changes before implementation.
- Keep controllers thin; put domain rules in services.
- Never bypass `WorkflowService` for status changes.
- Never mutate a published schema in place.
- Never treat AI free text as authoritative output.
- Add migrations with every database model change.
- Keep frontend components focused:
  - `TemplateDesigner`
  - `SchemaRenderer`
  - `TaskList`
  - `LabelerWorkbench`
  - `ReviewQueue`
  - `ExportCenter`
- Use explicit TypeScript/Python types; avoid broad `any` or untyped dictionaries except at validated JSON boundaries.
- If a feature depends on an unknown policy, ask the user instead of guessing.

## 16. Questions Codex Must Ask Before Deciding

Ask the user if any of these arise:

- Which LLM provider and credentials should be used in production?
- Should auth be demo-only or real multi-user auth?
- Should deployment target be local Docker, cloud VM, Render/Railway/Fly, or another platform?
- Should uploaded datasets contain sensitive/private data requiring stricter retention?
- Should AI Agent be allowed to auto-return submissions, or only recommend human review?
- Should labelers manually claim work, or should assignments be pushed automatically?
- Should template designer support multi-tab/group layouts in MVP or as a later phase?

Default assumptions until answered:

- LLM provider is OpenAI-compatible and configured by environment variables.
- Auth is JWT username/password for MVP.
- Deployment is Docker Compose.
- AI Agent may auto-pass, auto-return, or request human review according to configured thresholds.
- Labelers manually claim work from task marketplace.
- Multi-tab/group layouts are phase-2 enhancement after the core schema renderer works.

## 17. Reference Notes

- LangGraph is selected for durable, stateful, long-running agent workflows with human-in-the-loop support.
- LangGraph persistence/checkpointing is useful for recovery, but business audit records must still be stored in application tables.
- LangChain structured output should be used for AI review results through Pydantic schemas.
- FastAPI is selected for Python API development with type hints, Pydantic validation, and OpenAPI documentation.

