import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerTaskDetailRoute } from "../../routes/owner/OwnerTaskDetailRoute";
import { OwnerTasksRoute } from "../../routes/owner/OwnerTasksRoute";

const task = {
  id: "task-1",
  name: "Sentiment QA",
  description: "Owner workflow",
  status: "draft",
  distribution_strategy: "manual",
  quota_per_labeler: 3,
  deadline_at: null,
  created_by: "owner-1",
  created_at: "2026-05-23T00:00:00Z",
  updated_at: "2026-05-23T00:00:00Z",
};

const agentWorkflowSummary = {
  task_id: "task-1",
  submission_status_counts: { ai_passed: 2, needs_human_review: 1 },
  ai_decision_counts: { pass: 2, human_review: 1 },
  pending_count: 1,
  failed_count: 0,
  recent_workflows: [
    {
      submission_id: "sub-1",
      assignment_id: "assignment-1",
      task_id: "task-1",
      current_status: "ai_passed",
      steps: [
        {
          key: "ai_decision",
          label: "AI decision",
          status: "complete",
          timestamp: "2026-05-23T00:01:00Z",
          actor_role: "ai_agent",
          summary: "Submission is ready for human approval.",
          metadata: { decision: "pass", overall_score: 94, model_name: "deepseek-chat" },
        },
      ],
    },
  ],
};

describe("owner console", () => {
  beforeEach(() => {
    localStorage.setItem("labelhub.accessToken", "owner-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders fetched owner tasks in the task table", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([task]),
    );

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sentiment QA")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("手动分配")).toBeInTheDocument();
  });

  it("submits the create task payload expected by the backend contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks") && init?.method === "POST") {
        return jsonResponse({ ...task, name: "New task", quota_per_labeler: 5 }, 201);
      }
      return jsonResponse([]);
    });

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /新\s*建\s*任\s*务/ }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "New task" } });
    fireEvent.change(screen.getByLabelText("描述"), { target: { value: "Import review rows" } });
    fireEvent.change(screen.getByLabelText("每位标注员配额"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /创\s*建\s*任\s*务/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "New task",
            description: "Import review rows",
            distribution_strategy: "manual",
            quota_per_labeler: 5,
            deadline_at: null,
          }),
        }),
      );
    });
  });

  it("routes draft tasks to setup instead of publishing from the list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([task]));

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    const row = await screen.findByRole("row", { name: /Sentiment QA/i });

    expect(within(row).queryByRole("button", { name: /发\s*布/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "配置" })).toHaveAttribute("href", "/owner/tasks/task-1");
  });

  it("publishes a ready draft task from the task detail route", async () => {
    const readyTemplate = {
      id: "schema-1",
      task_id: "task-1",
      version: 1,
      title: "Sentiment schema",
      schema_payload: { version: 1, title: "Sentiment schema", layout: { type: "single", groups: [] }, fields: [], llmTools: [], validations: [], visibilityRules: [] },
      is_published: true,
      created_by: "owner-1",
      created_at: "2026-05-23T00:00:00Z",
      published_at: "2026-05-23T00:00:00Z",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks/task-1/publish")) {
        return jsonResponse({ ...task, status: "published" });
      }
      if (String(input).endsWith("/tasks/task-1")) return jsonResponse(task);
      if (String(input).endsWith("/tasks/task-1/items")) {
        return jsonResponse([{ id: "item-1", task_id: "task-1", external_id: "row-1", payload: { text: "one" }, status: "available", created_at: "2026-05-23T00:00:00Z" }]);
      }
      if (String(input).endsWith("/tasks/task-1/template")) return jsonResponse(readyTemplate);
      if (String(input).endsWith("/tasks/task-1/review-config")) return jsonResponse(null, 404);
      if (String(input).endsWith("/tasks/task-1/exports")) return jsonResponse([]);
      if (String(input).endsWith("/tasks/task-1/agent-workflow")) return jsonResponse(null, 404);
      return jsonResponse({});
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/owner/tasks/task-1"]}
      >
        <Routes>
          <Route path="/owner/tasks/:taskId" element={<OwnerTaskDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "发布任务" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks\/task-1\/publish$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => expect(screen.getAllByText("已发布").length).toBeGreaterThan(0));
  });

  it("validates review criteria JSON before saving config", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/tasks/task-1")) return jsonResponse(task);
      if (String(input).endsWith("/tasks/task-1/items")) return jsonResponse([]);
      if (String(input).endsWith("/tasks/task-1/review-config")) {
        return jsonResponse({
          id: "config-1",
          task_id: "task-1",
          prompt_template: "",
          criteria: [],
          pass_threshold: 80,
          return_threshold: 40,
          manual_review_threshold: 60,
          model_name: "gpt-4.1-mini",
          temperature: 0,
          max_retries: 2,
          created_at: "2026-05-23T00:00:00Z",
          updated_at: "2026-05-23T00:00:00Z",
        });
      }
      if (String(input).endsWith("/tasks/task-1/template")) return jsonResponse(null, 404);
      if (String(input).endsWith("/tasks/task-1/exports")) return jsonResponse([]);
      return jsonResponse({});
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/owner/tasks/task-1"]}
      >
        <Routes>
          <Route path="/owner/tasks/:taskId" element={<OwnerTaskDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "审核配置" }));
    const criteria = await screen.findByLabelText("评分标准 JSON");
    fireEvent.change(criteria, { target: { value: "{\"name\":\"not array\"}" } });
    fireEvent.click(screen.getByRole("button", { name: "保存审核配置" }));

    expect(await screen.findByText("评分标准必须是 JSON 数组。")).toBeInTheDocument();
  });

  it("renders owner agent workflow summary on the task dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/tasks/task-1")) return jsonResponse({ ...task, status: "published" });
      if (String(input).endsWith("/tasks/task-1/items")) return jsonResponse([]);
      if (String(input).endsWith("/tasks/task-1/agent-workflow")) return jsonResponse(agentWorkflowSummary);
      if (String(input).endsWith("/tasks/task-1/review-config")) return jsonResponse(null, 404);
      if (String(input).endsWith("/tasks/task-1/template")) return jsonResponse(null, 404);
      if (String(input).endsWith("/tasks/task-1/exports")) return jsonResponse([]);
      return jsonResponse({});
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/owner/tasks/task-1"]}
      >
        <Routes>
          <Route path="/owner/tasks/:taskId" element={<OwnerTaskDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Agent 工作流")).toBeInTheDocument();
    expect(screen.getByText("待处理 Agent 工作")).toBeInTheDocument();
    expect(screen.getAllByText("AI 决策").length).toBeGreaterThan(0);
    expect(screen.getByText(/deepseek-chat/i)).toBeInTheDocument();
    expect(screen.queryByText(/not exposed by the current owner API contract/i)).not.toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
