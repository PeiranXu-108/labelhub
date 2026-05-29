import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LabelerAssignmentRoute } from "../../routes/labeler/LabelerAssignmentRoute";
import { LabelerTasksRoute } from "../../routes/labeler/LabelerTasksRoute";

const task = {
  id: "task-1",
  name: "Support QA",
  description: "Review support conversations",
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

    fireEvent.click(await screen.findByRole("button", { name: /claim/i }));

    expect(await screen.findByRole("heading", { name: "Assignment workbench" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/tasks/task-1/claim"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/tasks/task-1/template"))).toBe(false);
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

    fireEvent.click(await screen.findByRole("button", { name: /^submit$/i }));

    expect(await screen.findByText("Sentiment is required")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/submit"),
      expect.anything(),
    );
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

    expect(await screen.findByText("Agent workflow")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("AI review job queued.")).toBeInTheDocument();
  });
});
