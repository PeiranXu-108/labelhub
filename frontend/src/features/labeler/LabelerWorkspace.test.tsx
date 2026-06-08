import { act, fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LabelerAssignmentRoute } from "../../routes/labeler/LabelerAssignmentRoute";
import { LabelerTasksRoute } from "../../routes/labeler/LabelerTasksRoute";

const task = {
  id: "task-1",
  name: "Support QA",
  description: "Review support conversations",
  instruction_rich_text: { format: "markdown", content: "Follow the policy notes." },
  instruction_plain_text: "Follow the policy notes.",
  tags: ["support qa", "policy"],
  reward_rule: {
    mode: "fixed_per_accepted_submission",
    currency: "USD",
    amount: "1.25",
    description: "Accepted submissions only.",
  },
  quality_rules: [{ label: "Evidence", description: "Cite the source text." }],
  status: "published",
  distribution_strategy: "AUTO_CLAIM",
  quota_per_labeler: null,
  deadline_at: null,
  created_by: "owner-1",
  created_at: "2026-05-23T00:00:00Z",
  updated_at: "2026-05-23T00:00:00Z",
};

const item = {
  id: "item-1",
  task_id: "task-1",
  external_id: "ticket-1",
  payload: { text: "The answer was helpful." },
  status: "available",
  created_at: "2026-05-23T00:00:00Z",
};

const item2 = {
  ...item,
  id: "item-2",
  external_id: "ticket-2",
  payload: { text: "Second text needs labeling." },
};

const submission = {
  id: "sub-1",
  task_id: "task-1",
  item_id: "item-1",
  assignment_id: "assignment-1",
  labeler_id: "labeler-1",
  template_schema_id: "schema-1",
  schema_version: 1,
  answer_payload: {},
  status: "draft",
  review_stage: null,
  attempt: 1,
  submitted_at: null,
  created_at: "2026-05-23T00:00:00Z",
  updated_at: "2026-05-23T00:00:00Z",
};

const submission2 = {
  ...submission,
  id: "sub-2",
  item_id: "item-2",
  assignment_id: "assignment-2",
  answer_payload: {},
};

const template = {
  id: "schema-1",
  task_id: "task-1",
  version: 1,
  title: "QA annotation",
  schema_payload: {
    version: 1,
    title: "QA annotation",
    layout: { type: "single", groups: [] },
    fields: [
      { id: "source", type: "show_item", label: "Source text", source: "item.payload.text" },
      {
        id: "sentiment",
        type: "radio",
        label: "Sentiment",
        required: true,
        options: [
          { label: "Positive", value: "positive" },
          { label: "Negative", value: "negative" },
        ],
      },
    ],
    llmTools: [],
    validations: [],
    visibilityRules: [],
  },
  is_published: true,
  created_by: "owner-1",
  created_at: "2026-05-23T00:00:00Z",
  published_at: "2026-05-23T00:00:00Z",
};

const textTemplate = {
  ...template,
  schema_payload: {
    ...template.schema_payload,
    fields: [
      { id: "source", type: "show_item", label: "Source text", source: "item.payload.text" },
      { id: "summary", type: "text", label: "Summary", required: true },
    ],
  },
};

const assignmentDetail = {
  id: "assignment-1",
  task_id: "task-1",
  item_id: "item-1",
  labeler_id: "labeler-1",
  status: "claimed",
  claimed_at: "2026-05-23T00:00:00Z",
  expires_at: null,
  item,
  submission,
  task,
  template_schema: template,
  latest_human_review: null,
};

const assignmentDetailWithTextInput = {
  ...assignmentDetail,
  template_schema: textTemplate,
};

const assignmentDetail2 = {
  ...assignmentDetail,
  id: "assignment-2",
  item_id: "item-2",
  item: item2,
  submission: submission2,
};

const agentWorkflow = {
  submission_id: "sub-1",
  assignment_id: "assignment-1",
  task_id: "task-1",
  current_status: "submitted",
  steps: [
    {
      key: "submitted",
      label: "Submitted",
      status: "complete",
      timestamp: "2026-05-23T00:00:00Z",
      actor_role: "labeler",
      summary: "Labeler submitted answers.",
      metadata: {},
    },
    {
      key: "queued",
      label: "Queued",
      status: "active",
      timestamp: "2026-05-23T00:00:00Z",
      actor_role: "system",
      summary: "AI review job queued.",
      metadata: {},
    },
  ],
};

const navigationProductivity = {
  assignment_id: "assignment-1",
  task_id: "task-1",
  previous_assignment_id: null,
  next_assignment_id: "assignment-2",
  can_claim_next: false,
  has_previous: false,
  has_next: true,
  no_work_left: false,
  current_position: 1,
  total_count: 2,
  items: [
    {
      item_id: "item-1",
      external_id: "ticket-1",
      assignment_id: "assignment-1",
      submission_id: "sub-1",
      labeler_id: "labeler-1",
      position: 1,
      status: "draft",
      assignment_status: "active",
      is_current: true,
      is_navigable: true,
      navigation_action: "open",
    },
    {
      item_id: "item-2",
      external_id: "ticket-2",
      assignment_id: "assignment-2",
      submission_id: "sub-2",
      labeler_id: "labeler-1",
      position: 2,
      status: "submitted",
      assignment_status: "submitted",
      is_current: false,
      is_navigable: true,
      navigation_action: "open",
    },
  ],
  contribution: {
    task_id: "task-1",
    labeler_id: "labeler-1",
    draft_count: 1,
    submitted_count: 1,
    approved_passed_count: 0,
    returned_rejected_count: 0,
    total_owned_count: 2,
  },
  history: [
    {
      id: "audit-1",
      kind: "audit",
      action: "save_draft",
      title: "草稿已保存",
      summary: "标注员保存了当前草稿。",
      actor_role: "labeler",
      from_status: null,
      to_status: null,
      created_at: "2026-05-23T00:10:00Z",
    },
  ],
};

const navigationAfterSubmit = {
  ...navigationProductivity,
  items: navigationProductivity.items.map((navItem) =>
    navItem.item_id === "item-1"
      ? { ...navItem, status: "submitted", assignment_status: "submitted" }
      : navItem,
  ),
  contribution: {
    ...navigationProductivity.contribution,
    draft_count: 0,
    submitted_count: 2,
  },
  history: [
    ...navigationProductivity.history,
    {
      id: "audit-2",
      kind: "audit",
      action: "submit",
      title: "答案已提交",
      summary: "标注员提交了当前答案。",
      actor_role: "labeler",
      from_status: "draft",
      to_status: "submitted",
      created_at: "2026-05-23T00:12:00Z",
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("labeler workspace", () => {
  beforeEach(() => {
    localStorage.setItem("labelhub.accessToken", "token");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("claims a marketplace task and opens the assignment workbench", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/tasks")) return jsonResponse([task]);
      if (url.endsWith("/labeler/tasks/task-1/claim")) {
        return jsonResponse({ id: "assignment-1", task_id: "task-1", item_id: "item-1", labeler_id: "labeler-1", status: "claimed", claimed_at: "2026-05-23T00:00:00Z", expires_at: null, item, submission }, 201);
      }
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/tasks"]}>
        <Routes>
          <Route path="/labeler/tasks" element={<LabelerTasksRoute />} />
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /认\s*领/ }));

    expect(await screen.findByRole("heading", { name: "标注工作台" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/tasks/task-1/claim"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/tasks/task-1/template"))).toBe(false);
  });

  it("shows task metadata in marketplace and assignment workbench", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/tasks")) return jsonResponse([task]);
      if (url.endsWith("/labeler/submissions")) return jsonResponse([]);
      if (url.endsWith("/labeler/assignments/assignment-1")) return jsonResponse(assignmentDetail);
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/labeler/tasks"]}>
        <Routes>
          <Route path="/labeler/tasks" element={<LabelerTasksRoute />} />
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Follow the policy notes.")).toBeInTheDocument();
    expect(screen.getByText("support qa")).toBeInTheDocument();
    expect(screen.getByText("Accepted submissions only.")).toBeInTheDocument();

    unmount();
    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/tasks" element={<LabelerTasksRoute />} />
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("任务说明")).toBeInTheDocument();
    expect(screen.getByText("Follow the policy notes.")).toBeInTheDocument();
    expect(screen.getByText("Accepted submissions only.")).toBeInTheDocument();
    expect(screen.getByText("Evidence: Cite the source text.")).toBeInTheDocument();
  });

  it("renders from assignment template snapshot and autosaves changed answers after the debounce window", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/draft")) {
        return jsonResponse({ ...submission, answer_payload: JSON.parse(String(init?.body)).answer_payload });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    const positiveOption = await screen.findByLabelText("Positive");
    vi.useFakeTimers();
    fireEvent.click(positiveOption);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/draft"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ answer_payload: { sentiment: "positive" } }),
      }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/tasks/task-1/template"))).toBe(false);
  });

  it("blocks submit when required fields are empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /提\s*交/ }));

    expect(await screen.findByText("请填写Sentiment")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/submit"),
      expect.anything(),
    );
  });

  it("shows repeated submit API failures as a localized top message", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/draft")) {
        return jsonResponse({ ...submission, answer_payload: { sentiment: "positive" } });
      }
      if (url.endsWith("/labeler/assignments/assignment-1/submit")) {
        return jsonResponse(
          { detail: { message: "Cannot apply submit to submission in submitted" } },
          409,
        );
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <AntApp>
        <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
          <Routes>
            <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
          </Routes>
        </MemoryRouter>
      </AntApp>,
    );

    fireEvent.click(await screen.findByLabelText("Positive"));
    fireEvent.click(screen.getByRole("button", { name: /提\s*交/ }));

    expect(await screen.findByText("当前状态为已提交，不能重复提交。")).toBeInTheDocument();
    expect(screen.queryByText("Cannot apply submit to submission in submitted")).not.toBeInTheDocument();
  });

  it("shows the reviewer return reason for returned revisions", async () => {
    const returnedSubmission = { ...submission, status: "returned", review_stage: "initial_review", attempt: 2 };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse({
          ...assignmentDetail,
          submission: returnedSubmission,
          latest_human_review: {
            id: "review-1",
            submission_id: "sub-1",
            reviewer_id: "reviewer-1",
            decision: "return",
            stage: "initial_review",
            round: 1,
            compared_from_attempt: null,
            compared_to_attempt: 1,
            reason: "Please cite the exact customer sentiment.",
            review_metadata: {},
            created_at: "2026-05-23T01:00:00Z",
          },
        });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Please cite the exact customer sentiment\./)).toBeInTheDocument();
    expect(screen.getAllByText(/初审退回/).length).toBeGreaterThan(0);
  });

  it("shows the agent workflow progress for the assignment", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse({
          ...assignmentDetail,
          submission: { ...submission, status: "submitted", submitted_at: "2026-05-23T00:00:00Z" },
        });
      }
      if (url.endsWith("/labeler/assignments/assignment-1/agent-workflow")) {
        return jsonResponse(agentWorkflow);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Agent 工作流")).toBeInTheDocument();
    expect(screen.getByText("已排队")).toBeInTheDocument();
    expect(screen.getByText("AI 审核任务已排队。")).toBeInTheDocument();
  });

  it("shows disabled navigation controls when no adjacent work exists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        return jsonResponse({
          assignment_id: "assignment-1",
          task_id: "task-1",
          previous_assignment_id: null,
          next_assignment_id: null,
          can_claim_next: false,
          has_previous: false,
          has_next: false,
          no_work_left: true,
        });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "上一个" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一个" })).toBeDisabled();
    expect(screen.getByText("没有更多可标注的数据项。")).toBeInTheDocument();
  });

  it("renders assignment navigation, contribution summary, and persisted history", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        return jsonResponse(navigationProductivity);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("作业导航")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("ticket-1")).toBeInTheDocument();
    expect(screen.getByText("ticket-2")).toBeInTheDocument();
    expect(screen.getAllByText("草稿").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已提交").length).toBeGreaterThan(0);
    expect(screen.getByText("我的贡献")).toBeInTheDocument();
    expect(screen.getByText("草稿/进行中 1")).toBeInTheDocument();
    expect(screen.getByText("当前作业历史")).toBeInTheDocument();
    expect(screen.getByText("草稿已保存")).toBeInTheDocument();
  });

  it("refreshes contribution summary and history after a successful submit", async () => {
    let navigationCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        navigationCalls += 1;
        return jsonResponse(navigationCalls === 1 ? navigationProductivity : navigationAfterSubmit);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/submit")) {
        return jsonResponse({
          ...submission,
          status: "submitted",
          answer_payload: JSON.parse(String(init?.body)).answer_payload,
          submitted_at: "2026-05-23T00:12:00Z",
        });
      }
      if (url.endsWith("/labeler/assignments/assignment-1/agent-workflow")) {
        return jsonResponse(agentWorkflow);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("草稿/进行中 1")).toBeInTheDocument();
    expect(screen.queryByText("答案已提交")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Positive"));
    fireEvent.click(screen.getByText("提 交"));

    expect(await screen.findByText("答案已提交")).toBeInTheDocument();
    expect(screen.getByText("草稿/进行中 0")).toBeInTheDocument();
    expect(screen.getByText("已提交 2")).toBeInTheDocument();
    expect(navigationCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/navigation"),
      expect.anything(),
    );
  });

  it("reports a problem from the modal without submitting the annotation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        return jsonResponse(navigationProductivity);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/problem-reports")) {
        return jsonResponse({
          id: "audit-2",
          assignment_id: "assignment-1",
          task_item_id: "item-1",
          labeler_id: "labeler-1",
          category: JSON.parse(String(init?.body)).category,
          note: JSON.parse(String(init?.body)).note,
          created_at: "2026-05-23T00:12:00Z",
        }, 201);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "报告问题" }));
    fireEvent.change(screen.getByLabelText("问题说明"), {
      target: { value: "The source text is truncated." },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交报告" }));

    expect(await screen.findByText("问题已记录。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/problem-reports"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ category: "bad_source", note: "The source text is truncated." }),
      }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/submit"))).toBe(false);
  });

  it("does not run keyboard shortcuts while typing in form inputs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetailWithTextInput);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        return jsonResponse(navigationProductivity);
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    const summaryInput = await screen.findByLabelText("Summary");
    fireEvent.change(summaryInput, { target: { value: "typing should be safe" } });
    fireEvent.keyDown(summaryInput, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(summaryInput, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(summaryInput, { key: "r", altKey: true });

    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/submit"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/next"))).toBe(false);
    expect(screen.queryByRole("dialog", { name: "报告问题" })).not.toBeInTheDocument();
  });

  it("saves unsaved draft answers before navigating to the next assignment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        return jsonResponse({
          assignment_id: "assignment-1",
          task_id: "task-1",
          previous_assignment_id: null,
          next_assignment_id: null,
          can_claim_next: true,
          has_previous: false,
          has_next: true,
          no_work_left: false,
        });
      }
      if (url.endsWith("/labeler/assignments/assignment-1/draft")) {
        return jsonResponse({ ...submission, answer_payload: JSON.parse(String(init?.body)).answer_payload });
      }
      if (url.endsWith("/labeler/assignments/assignment-1/next")) {
        return jsonResponse({
          direction: "next",
          assignment: assignmentDetail2,
          navigation: {
            assignment_id: "assignment-2",
            task_id: "task-1",
            previous_assignment_id: "assignment-1",
            next_assignment_id: null,
            can_claim_next: false,
            has_previous: true,
            has_next: false,
            no_work_left: true,
          },
          no_work_left: false,
          message: "Navigation target ready.",
          skipped_assignment_id: null,
          skip_reason: null,
        });
      }
      if (url.endsWith("/labeler/assignments/assignment-2")) {
        return jsonResponse(assignmentDetail2);
      }
      if (url.endsWith("/labeler/assignments/assignment-2/navigation")) {
        return jsonResponse({
          assignment_id: "assignment-2",
          task_id: "task-1",
          previous_assignment_id: "assignment-1",
          next_assignment_id: null,
          can_claim_next: false,
          has_previous: true,
          has_next: false,
          no_work_left: true,
        });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByLabelText("Positive"));
    fireEvent.click(screen.getByRole("button", { name: "下一个" }));

    expect((await screen.findAllByText(/Second text needs labeling/)).length).toBeGreaterThan(0);
    const draftCallIndex = fetchMock.mock.calls.findIndex(([input]) =>
      String(input).endsWith("/labeler/assignments/assignment-1/draft"),
    );
    const nextCallIndex = fetchMock.mock.calls.findIndex(([input]) =>
      String(input).endsWith("/labeler/assignments/assignment-1/next"),
    );
    expect(draftCallIndex).toBeGreaterThanOrEqual(0);
    expect(nextCallIndex).toBeGreaterThan(draftCallIndex);
    expect(fetchMock.mock.calls[draftCallIndex][1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ answer_payload: { sentiment: "positive" } }),
      }),
    );
  });

  it("confirms skip with a reason and does not submit the annotation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/labeler/assignments/assignment-1")) {
        return jsonResponse(assignmentDetail);
      }
      if (url.endsWith("/labeler/assignments/assignment-1/navigation")) {
        return jsonResponse({
          assignment_id: "assignment-1",
          task_id: "task-1",
          previous_assignment_id: null,
          next_assignment_id: null,
          can_claim_next: true,
          has_previous: false,
          has_next: true,
          no_work_left: false,
        });
      }
      if (url.endsWith("/labeler/assignments/assignment-1/skip")) {
        return jsonResponse({
          direction: "skip",
          assignment: assignmentDetail2,
          navigation: {
            assignment_id: "assignment-2",
            task_id: "task-1",
            previous_assignment_id: null,
            next_assignment_id: null,
            can_claim_next: false,
            has_previous: false,
            has_next: false,
            no_work_left: true,
          },
          no_work_left: false,
          message: "Navigation target ready.",
          skipped_assignment_id: "assignment-1",
          skip_reason: JSON.parse(String(init?.body)).reason,
        });
      }
      if (url.endsWith("/labeler/assignments/assignment-2")) {
        return jsonResponse(assignmentDetail2);
      }
      if (url.endsWith("/labeler/assignments/assignment-2/navigation")) {
        return jsonResponse({
          assignment_id: "assignment-2",
          task_id: "task-1",
          previous_assignment_id: null,
          next_assignment_id: null,
          can_claim_next: false,
          has_previous: false,
          has_next: false,
          no_work_left: true,
        });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/labeler/assignments/assignment-1"]}>
        <Routes>
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /跳\s*过/ }));
    fireEvent.change(screen.getByLabelText("跳过原因"), {
      target: { value: "Text is unreadable" },
    });
    fireEvent.click(screen.getByRole("button", { name: /确认\s*跳过/ }));

    expect((await screen.findAllByText(/Second text needs labeling/)).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/skip"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Text is unreadable" }),
      }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/submit"))).toBe(false);
  });
});
