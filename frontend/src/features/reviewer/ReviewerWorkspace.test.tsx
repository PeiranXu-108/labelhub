import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewQueueRoute } from "../../routes/review/ReviewQueueRoute";
import { ReviewSubmissionRoute } from "../../routes/review/ReviewSubmissionRoute";

const submission = {
  id: "sub-1",
  task_id: "task-1",
  item_id: "item-1",
  assignment_id: "assignment-1",
  labeler_id: "labeler-1",
  template_schema_id: "schema-1",
  schema_version: 1,
  answer_payload: { sentiment: "positive" },
  status: "needs_human_review",
  attempt: 1,
  submitted_at: "2026-05-23T00:00:00Z",
  created_at: "2026-05-23T00:00:00Z",
  updated_at: "2026-05-23T00:00:00Z",
};

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
  status: "submitted",
  created_at: "2026-05-23T00:00:00Z",
};

const audit = {
  id: "audit-1",
  entity_type: "submission",
  entity_id: "sub-1",
  action: "submit",
  actor_id: "labeler-1",
  actor_role: "labeler",
  from_status: "draft",
  to_status: "submitted",
  reason: null,
  details: {},
  created_at: "2026-05-23T00:00:00Z",
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
    fields: [{ id: "source", type: "show_item", label: "Source text", source: "item.payload.text" }],
    llmTools: [],
    validations: [],
    visibilityRules: [],
  },
  is_published: true,
  created_by: "owner-1",
  created_at: "2026-05-23T00:00:00Z",
  published_at: "2026-05-23T00:00:00Z",
};

const aiReview = {
  id: "ai-1",
  submission_id: "sub-1",
  decision: "human_review",
  overall_score: 72,
  status: "completed",
  structured_response: { decision: "human_review", overall_score: 72, criteria: [{ name: "accuracy", score: 72 }] },
  prompt_snapshot: "Grade the submitted annotation.",
  model_name: "gpt-test",
  created_at: "2026-05-23T00:01:00Z",
};

const humanReview = {
  id: "human-1",
  submission_id: "sub-1",
  reviewer_id: "reviewer-1",
  decision: "return",
  reason: "Needs clearer evidence.",
  review_metadata: {},
  created_at: "2026-05-23T00:02:00Z",
};

const detail = {
  submission,
  task,
  item,
  template_schema: template,
  agent_workflow: {
    submission_id: "sub-1",
    assignment_id: "assignment-1",
    task_id: "task-1",
    current_status: "needs_human_review",
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
        key: "ai_decision",
        label: "AI decision",
        status: "complete",
        timestamp: "2026-05-23T00:01:00Z",
        actor_role: "ai_agent",
        summary: "Needs human confirmation.",
        metadata: { decision: "human_review", overall_score: 72, model_name: "deepseek-chat" },
      },
      {
        key: "human_review",
        label: "Human review",
        status: "active",
        timestamp: null,
        actor_role: null,
        summary: "Waiting for reviewer action.",
        metadata: {},
      },
    ],
  },
  ai_reviews: [aiReview],
  human_reviews: [humanReview],
  audit_logs: [audit],
  previous_attempts: [
    {
      id: "attempt-1",
      submission_id: "sub-1",
      attempt: 1,
      template_schema_id: "schema-1",
      schema_version: 1,
      answer_payload: { sentiment: "negative" },
      submitted_at: "2026-05-23T00:00:00Z",
      created_at: "2026-05-23T00:00:00Z",
    },
  ],
};

const queueItem = {
  submission,
  task,
  latest_ai_review: aiReview,
  latest_human_review: null,
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("reviewer workspace", () => {
  beforeEach(() => {
    localStorage.setItem("labelhub.accessToken", "token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("sends server-backed review queue filters and approves a submission", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/review/queue")) return jsonResponse([queueItem]);
      if (url.endsWith("/review/submissions/sub-1/approve")) {
        return jsonResponse({ ...submission, status: "approved" });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/review/queue"]}>
        <Routes>
          <Route path="/review/queue" element={<ReviewQueueRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    const table = await screen.findByRole("table");
    expect(within(table).getByText("needs_human_review")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ai_passed" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/review/queue?status=ai_passed"),
        expect.objectContaining({ method: "GET" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("AI decision"), { target: { value: "human_review" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("ai_decision=human_review"),
        expect.objectContaining({ method: "GET" }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));

    await waitFor(() => expect(screen.getByText("approved")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/review/submissions/sub-1/approve"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("blocks return actions until a reason is provided", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/review/submissions/sub-1")) return jsonResponse(detail);
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/review/submissions/sub-1"]}>
        <Routes>
          <Route path="/review/submissions/:submissionId" element={<ReviewSubmissionRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^return$/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^return$/i }));

    expect(await screen.findByText("Return reason is required")).toBeInTheDocument();
  });

  it("refreshes persisted audit after return without fabricating a local timeline event", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/review/submissions/sub-1")) return jsonResponse(detail);
      if (url.endsWith("/review/submissions/sub-1/return")) {
        return jsonResponse({ ...submission, status: "returned" });
      }
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/review/submissions/sub-1"]}>
        <Routes>
          <Route path="/review/submissions/:submissionId" element={<ReviewSubmissionRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^return$/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Return reason"), {
      target: { value: "Needs clearer evidence." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^return$/i }));

    await waitFor(() => expect(screen.getByText("returned")).toBeInTheDocument());
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/review/submissions/sub-1"),
      ),
    ).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/audit?"))).toBe(false);
  });

  it("renders reviewer detail metadata from the expanded backend response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/review/submissions/sub-1")) return jsonResponse(detail);
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/review/submissions/sub-1"]}>
        <Routes>
          <Route path="/review/submissions/:submissionId" element={<ReviewSubmissionRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Grade the submitted annotation.")).toBeInTheDocument();
    expect(screen.getByText("gpt-test")).toBeInTheDocument();
    expect(screen.getByText("Needs clearer evidence.")).toBeInTheDocument();
    expect(screen.getByText(/Frozen template version 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Attempt 1/i)).toBeInTheDocument();
    expect(screen.getByText(/negative/i)).toBeInTheDocument();
    expect(screen.getByText("submit")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/audit?"))).toBe(false);
  });

  it("renders the agent workflow timeline on reviewer detail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/review/submissions/sub-1")) return jsonResponse(detail);
      return jsonResponse({ detail: { message: `Unhandled ${url}` } }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/review/submissions/sub-1"]}>
        <Routes>
          <Route path="/review/submissions/:submissionId" element={<ReviewSubmissionRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Agent workflow")).toBeInTheDocument();
    expect(screen.getByText("AI decision")).toBeInTheDocument();
    expect(screen.getByText("Needs human confirmation.")).toBeInTheDocument();
    expect(screen.getAllByText(/human_review/).length).toBeGreaterThan(0);
  });
});
