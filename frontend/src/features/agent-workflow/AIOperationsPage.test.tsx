import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIOperationsRoute } from "../../routes/ai-operations/AIOperationsRoute";
import { AIOperationDetailRoute } from "../../routes/ai-operations/AIOperationDetailRoute";

const run = {
  submission_id: "sub-1",
  task_id: "task-1",
  task_name: "Support QA",
  labeler_id: "labeler-1",
  attempt: 1,
  run_status: "failed",
  workflow_status: "needs_human_review",
  current_stage: "initial_review",
  ai_decision: "human_review",
  overall_score: 72,
  model_name: "ops-model",
  retry_count: 2,
  operator_retry_count: 0,
  idempotency_key: "sub-1:1",
  latest_ai_review_id: "ai-1",
  latest_ai_review_status: "failed",
  submitted_at: "2026-06-08T01:00:00Z",
  last_run_at: "2026-06-08T01:02:00Z",
  updated_at: "2026-06-08T01:03:00Z",
};

const submission = {
  id: "sub-1",
  task_id: "task-1",
  item_id: "item-1",
  assignment_id: "assignment-1",
  labeler_id: "labeler-1",
  template_schema_id: "schema-1",
  schema_version: 1,
  answer_payload: { sentiment: "positive", rationale: "Clear match." },
  status: "needs_human_review",
  review_stage: "initial_review",
  attempt: 1,
  submitted_at: "2026-06-08T01:00:00Z",
  created_at: "2026-06-08T01:00:00Z",
  updated_at: "2026-06-08T01:03:00Z",
};

const task = {
  id: "task-1",
  name: "Support QA",
  description: "Review support labels",
  instruction_rich_text: null,
  instruction_plain_text: null,
  tags: [],
  reward_rule: { mode: "none", currency: null, amount: null, description: null },
  quality_rules: [],
  status: "published",
  distribution_strategy: "manual",
  quota_per_labeler: null,
  deadline_at: null,
  created_by: "owner-1",
  created_at: "2026-06-08T00:00:00Z",
  updated_at: "2026-06-08T00:00:00Z",
};

const item = {
  id: "item-1",
  task_id: "task-1",
  external_id: "row-1",
  payload: { text: "The answer was helpful." },
  status: "submitted",
  created_at: "2026-06-08T00:00:00Z",
};

const templateSchema = {
  id: "schema-1",
  task_id: "task-1",
  version: 1,
  title: "Support QA schema",
  schema_payload: {
    version: 1,
    title: "Support QA schema",
    layout: { type: "single", groups: [] },
    fields: [],
    llmTools: [],
    validations: [],
    visibilityRules: [],
  },
  is_published: true,
  created_by: "owner-1",
  created_at: "2026-06-08T00:00:00Z",
  published_at: "2026-06-08T00:00:00Z",
};

const aiReview = {
  id: "ai-1",
  submission_id: "sub-1",
  decision: "human_review",
  overall_score: 72,
  status: "failed",
  structured_response: {
    decision: "human_review",
    overall_score: 72,
    criterion_scores: [{ key: "accuracy", score: 4, reason: "Mostly correct." }],
    summary: "Needs human confirmation.",
    return_reasons: [],
    suggestions: ["Check edge cases."],
    idempotency_key: "sub-1:1",
  },
  prompt_snapshot: "Review this annotation using the frozen schema.",
  model_name: "ops-model",
  raw_provider_response: { provider: "mock" },
  error_metadata: {
    idempotency_key: "sub-1:1",
    retry_count: 2,
    failure_reason: "Missing LABELHUB_LLM_API_KEY",
    errors: ["Missing LABELHUB_LLM_API_KEY"],
    model_metadata: { provider: "deepseek", model: "ops-model", has_credentials: false },
  },
  retry_count: 2,
  idempotency_key: "sub-1:1",
  created_at: "2026-06-08T01:02:00Z",
};

const auditLog = {
  id: "audit-1",
  entity_type: "submission",
  entity_id: "sub-1",
  action: "retry_ai_review",
  actor_id: "reviewer-1",
  actor_role: "reviewer",
  from_status: "needs_human_review",
  to_status: "ai_reviewing",
  reason: "Operator retried failed AI review.",
  details: { idempotency_key: "sub-1:1" },
  created_at: "2026-06-08T01:04:00Z",
};

const detail = {
  ...run,
  submission,
  task,
  item,
  template_schema: templateSchema,
  review_config: {
    id: "config-1",
    task_id: "task-1",
    prompt_template: "Review the submitted annotation.",
    criteria: [{ key: "accuracy", label: "Accuracy", maxScore: 5 }],
    pass_threshold: 80,
    return_threshold: 40,
    manual_review_threshold: 60,
    model_name: "ops-model",
    temperature: 0,
    max_retries: 2,
  },
  agent_workflow: {
    submission_id: "sub-1",
    assignment_id: "assignment-1",
    task_id: "task-1",
    current_status: "needs_human_review",
    steps: [
      {
        key: "ai_decision",
        label: "AI decision",
        status: "failed",
        timestamp: "2026-06-08T01:02:00Z",
        actor_role: "ai_agent",
        summary: "AI review failed or returned malformed structured output.",
        metadata: { decision: "human_review", overall_score: 72, model_name: "ops-model" },
      },
    ],
  },
  latest_ai_review: aiReview,
  ai_reviews: [aiReview],
  audit_logs: [auditLog],
  processing_logs: [auditLog],
  item_payload: item.payload,
  answer_payload: submission.answer_payload,
  score_dimensions: [{ key: "accuracy", score: 4, reason: "Mostly correct." }],
  verdict: {
    decision: "human_review",
    summary: "Needs human confirmation.",
    return_reasons: [],
    suggestions: ["Check edge cases."],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("AI operations page", () => {
  beforeEach(() => {
    localStorage.setItem("labelhub.accessToken", "token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("sends run filters from the operations queue", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/ai-operations/runs")) return jsonResponse([run]);
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/ai-operations"]}>
        <Routes>
          <Route path="/ai-operations" element={<AIOperationsRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Support QA")).toBeInTheDocument();
    expect(within(table).getByText("sub-1:1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("运行状态"), { target: { value: "failed" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/ai-operations/runs?run_status=failed"),
        expect.objectContaining({ method: "GET" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("AI 决策"), { target: { value: "human_review" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("ai_decision=human_review"),
        expect.objectContaining({ method: "GET" }),
      ),
    );
  });

  it("renders detail data and refreshes after a safe retry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/ai-operations/runs/sub-1") && init?.method === "GET") return jsonResponse(detail);
      if (url.endsWith("/ai-operations/runs/sub-1/retry")) {
        return jsonResponse({
          retry_performed: true,
          detail: {
            ...detail,
            run_status: "passed",
            workflow_status: "ai_passed",
            latest_ai_review: { ...aiReview, status: "completed", decision: "pass", overall_score: 96 },
          },
        });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <AntApp>
        <MemoryRouter initialEntries={["/ai-operations/runs/sub-1"]}>
          <Routes>
            <Route path="/ai-operations/runs/:submissionId" element={<AIOperationDetailRoute />} />
          </Routes>
        </MemoryRouter>
      </AntApp>,
    );

    expect(await screen.findByText("Review this annotation using the frozen schema.")).toBeInTheDocument();
    expect(screen.getAllByText("sub-1:1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ops-model").length).toBeGreaterThan(0);
    expect(screen.getByText((content) => content.includes('"criterion_scores"'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试 AI 审核" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/ai-operations/runs/sub-1/retry"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByText("已通过")).toBeInTheDocument();
  });

  it("shows controlled retry errors without losing detail context", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/ai-operations/runs/sub-1") && init?.method === "GET") return jsonResponse(detail);
      if (url.endsWith("/ai-operations/runs/sub-1/retry")) {
        return jsonResponse({ detail: { message: "Only failed AI review runs can be retried" } }, 409);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <AntApp>
        <MemoryRouter initialEntries={["/ai-operations/runs/sub-1"]}>
          <Routes>
            <Route path="/ai-operations/runs/:submissionId" element={<AIOperationDetailRoute />} />
          </Routes>
        </MemoryRouter>
      </AntApp>,
    );

    await screen.findByText("Review this annotation using the frozen schema.");
    fireEvent.click(screen.getByRole("button", { name: "重试 AI 审核" }));

    expect(await screen.findByText("只有失败的 AI 审核运行可以重试。")).toBeInTheDocument();
    expect(screen.getByText("Review this annotation using the frozen schema.")).toBeInTheDocument();
  });
});
