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
    const returnedSubmission = { ...submission, status: "returned", attempt: 2 };
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
