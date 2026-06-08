import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerTaskDetailRoute } from "../../routes/owner/OwnerTaskDetailRoute";
import { OwnerTasksRoute } from "../../routes/owner/OwnerTasksRoute";

const task = {
  id: "task-1",
  name: "Sentiment QA",
  description: "Owner workflow",
  instruction_rich_text: { format: "markdown", content: "Use the rubric before labeling." },
  instruction_plain_text: "Use the rubric before labeling.",
  tags: ["support qa", "priority"],
  reward_rule: {
    mode: "manual",
    currency: "USD",
    amount: null,
    description: "Settled outside LabelHub.",
  },
  quality_rules: [{ label: "Evidence", description: "Cite the conversation." }],
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

const taskListMetrics = {
  summary: {
    total_task_count: 2,
    published_task_count: 1,
    draft_task_count: 1,
    item_count: 3,
    submitted_count: 2,
    current_week_submitted_count: 2,
    average_progress_percent: 67,
  },
  task_metrics: [
    {
      task_id: "task-1",
      item_count: 3,
      submitted_count: 2,
      current_week_submitted_count: 2,
      progress_percent: 67,
      submission_status_counts: { submitted: 1, approved: 1 },
      ai_decision_counts: { pass: 1, human_review: 1 },
    },
  ],
};

const taskDetailMetrics = taskListMetrics.task_metrics[0];

describe("owner console", () => {
  beforeEach(() => {
    localStorage.setItem("labelhub.accessToken", "owner-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders fetched owner tasks in the task table", async () => {
    mockOwnerTaskListFetch([task], taskListMetrics);

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sentiment QA")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("手动分配")).toBeInTheDocument();
    expect(screen.getByText("本周提交")).toBeInTheDocument();
    expect(screen.getAllByText("67%").length).toBeGreaterThan(0);
  });

  it("applies owner task search and filters to list and metrics requests", async () => {
    const fetchMock = mockOwnerTaskListFetch([task], taskListMetrics);

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    await screen.findByText("Sentiment QA");
    fireEvent.change(screen.getByLabelText("任务搜索"), { target: { value: "support" } });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "状态筛选" }));
    fireEvent.click(await screen.findByText("已发布"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "分发方式筛选" }));
    fireEvent.click(await screen.findByText("自动认领"));
    fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/tasks?search=support&status=published&distribution_strategy=auto_claim"),
        expect.objectContaining({ method: "GET" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/tasks/metrics?search=support&status=published&distribution_strategy=auto_claim"),
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  it("submits the create task payload expected by the backend contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/tasks/metrics")) return jsonResponse(taskListMetrics);
      if (url.endsWith("/tasks") && init?.method === "POST") {
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
    fireEvent.click(screen.getByRole("button", { name: /保\s*存\s*草\s*稿/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "New task",
            description: "Import review rows",
            instruction_rich_text: null,
            instruction_plain_text: null,
            tags: [],
            reward_rule: { mode: "none", currency: null, amount: null, description: null },
            quality_rules: [],
            distribution_strategy: "manual",
            quota_per_labeler: 5,
            deadline_at: null,
          }),
        }),
      );
    });
  });

  it("submits rich instructions, tags, reward rule, and quality rules from the drawer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/tasks/metrics")) return jsonResponse(taskListMetrics);
      if (url.endsWith("/tasks") && init?.method === "POST") {
        return jsonResponse({ ...task, name: "Rewarded task" }, 201);
      }
      return jsonResponse([]);
    });

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /新\s*建\s*任\s*务/ }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Rewarded task" } });
    fireEvent.change(screen.getByLabelText("标注说明"), { target: { value: "Read **carefully**." } });
    fireEvent.change(screen.getByLabelText("标签"), { target: { value: "support, urgent" } });
    fireEvent.change(screen.getByLabelText("质量规则"), { target: { value: "Evidence: cite source text" } });
    fireEvent.mouseDown(screen.getByLabelText("奖励模式"));
    fireEvent.click(await screen.findByText("固定通过计件"));
    fireEvent.change(screen.getByLabelText("币种"), { target: { value: "usd" } });
    fireEvent.change(screen.getByLabelText("单条奖励金额"), { target: { value: "1.50" } });
    fireEvent.change(screen.getByLabelText("奖励说明"), { target: { value: "Accepted submissions only" } });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存\s*草\s*稿/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Rewarded task",
            description: null,
            instruction_rich_text: { format: "markdown", content: "Read **carefully**." },
            instruction_plain_text: "Read carefully.",
            tags: ["support", "urgent"],
            reward_rule: {
              mode: "fixed_per_accepted_submission",
              currency: "USD",
              amount: "1.50",
              description: "Accepted submissions only",
            },
            quality_rules: [{ label: "Evidence", description: "cite source text" }],
            distribution_strategy: "manual",
            quota_per_labeler: null,
            deadline_at: null,
          }),
        }),
      );
    });
  });

  it("routes draft tasks to setup instead of publishing from the list", async () => {
    mockOwnerTaskListFetch([task], taskListMetrics);

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    const row = await screen.findByRole("row", { name: /Sentiment QA/i });
    const progressHeader = screen.getByRole("columnheader", { name: "进度" });
    const progressCol = document.querySelector("col[style*='width: 180px']");

    expect(within(row).queryByRole("button", { name: /发\s*布/ })).not.toBeInTheDocument();
    expect(progressHeader).toHaveClass("owner-task-progress-cell");
    expect(progressCol).toBeInTheDocument();

    const setupLink = within(row).getByRole("link", { name: "配置" });
    expect(setupLink).toHaveAttribute("href", "/owner/tasks/task-1");
    expect(setupLink).toHaveClass("owner-task-action-link");
    expect(setupLink).not.toHaveClass("ant-btn-primary");
  });

  it("submits edit payload with distribution and existing metadata fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/tasks/metrics")) return jsonResponse(taskListMetrics);
      if (url.endsWith("/tasks/task-1") && init?.method === "PATCH") {
        return jsonResponse({ ...task, distribution_strategy: "auto_claim", quota_per_labeler: 7 });
      }
      if (/\/tasks(?:\?|$)/.test(url)) return jsonResponse([task]);
      return jsonResponse({});
    });

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <OwnerTasksRoute />
      </MemoryRouter>,
    );

    const row = await screen.findByRole("row", { name: /Sentiment QA/i });
    fireEvent.click(within(row).getByRole("button", { name: /编\s*辑/ }));
    fireEvent.mouseDown(screen.getByLabelText("分发方式"));
    fireEvent.click(await screen.findByText("自动认领"));
    fireEvent.change(screen.getByLabelText("每位标注员配额"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存\s*修\s*改/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks\/task-1$/),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Sentiment QA",
            description: "Owner workflow",
            instruction_rich_text: { format: "markdown", content: "Use the rubric before labeling." },
            instruction_plain_text: "Use the rubric before labeling.",
            tags: ["support qa", "priority"],
            reward_rule: {
              mode: "manual",
              currency: "USD",
              amount: null,
              description: "Settled outside LabelHub.",
            },
            quality_rules: [{ label: "Evidence", description: "Cite the conversation." }],
            distribution_strategy: "auto_claim",
            quota_per_labeler: 7,
            deadline_at: null,
          }),
        }),
      );
    });
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
      if (String(input).endsWith("/tasks/task-1/metrics")) return jsonResponse(taskDetailMetrics);
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

  it("keeps task publish blockers visible and actionable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/tasks/task-1")) return jsonResponse(task);
      if (String(input).endsWith("/tasks/task-1/items")) return jsonResponse([]);
      if (String(input).endsWith("/tasks/task-1/metrics")) return jsonResponse({ ...taskDetailMetrics, item_count: 0, submitted_count: 0, progress_percent: 0 });
      if (String(input).endsWith("/tasks/task-1/agent-workflow")) return jsonResponse(null, 404);
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

    expect(await screen.findByText("需要先导入至少一个数据项。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布任务" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "导入数据" }));
    expect(screen.getByRole("tab", { name: "数据集", selected: true })).toBeInTheDocument();
  });

  it("validates review criteria JSON before saving config", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/tasks/task-1")) return jsonResponse(task);
      if (String(input).endsWith("/tasks/task-1/items")) return jsonResponse([]);
      if (String(input).endsWith("/tasks/task-1/metrics")) return jsonResponse(taskDetailMetrics);
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
      if (String(input).endsWith("/tasks/task-1/metrics")) return jsonResponse(taskDetailMetrics);
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
    expect(screen.getByText("提交进度")).toBeInTheDocument();
    expect(screen.getByText("本周提交")).toBeInTheDocument();
    expect(screen.queryByText(/not exposed by the current owner API contract/i)).not.toBeInTheDocument();
  });

  it("renders task metadata on the owner dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/tasks/task-1")) return jsonResponse(task);
      if (String(input).endsWith("/tasks/task-1/items")) return jsonResponse([]);
      if (String(input).endsWith("/tasks/task-1/metrics")) return jsonResponse(taskDetailMetrics);
      if (String(input).endsWith("/tasks/task-1/agent-workflow")) return jsonResponse(null, 404);
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

    expect(await screen.findByText("任务元数据")).toBeInTheDocument();
    expect(screen.getByText("Use the rubric before labeling.")).toBeInTheDocument();
    expect(screen.getByText("support qa")).toBeInTheDocument();
    expect(screen.getByText("Settled outside LabelHub.")).toBeInTheDocument();
    expect(screen.getByText("Evidence: Cite the conversation.")).toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockOwnerTaskListFetch(tasks: unknown[], metrics: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/tasks/metrics")) return jsonResponse(metrics);
    if (/\/tasks(?:\?|$)/.test(url)) return jsonResponse(tasks);
    return jsonResponse({});
  });
}
