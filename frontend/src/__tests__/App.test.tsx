import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";

const ownerUser = {
  id: "owner-login",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
};

const labelerUser = {
  id: "labeler-login",
  email: "labeler@example.com",
  name: "Labeler",
  role: "labeler",
};

const reviewerUser = {
  id: "reviewer-login",
  email: "reviewer@example.com",
  name: "Reviewer",
  role: "reviewer",
};

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </MemoryRouter>,
  );
}

function mockJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("App auth routes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the default app shell without crashing", () => {
    renderApp("/");

    expect(screen.getByRole("heading", { name: "LabelHub Studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "总结待审核风险" })).toBeInTheDocument();
  });

  it("redirects protected routes to login when no token is stored", async () => {
    renderApp("/owner/tasks");

    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it.each([
    [ownerUser, "/tasks", "负责人任务"],
    [labelerUser, "/labeler/tasks", "标注任务"],
    [reviewerUser, "/review/queue", "审核队列"],
  ])("logs in %s and redirects to the role home", async (user, expectedListPath, heading) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        expect(init?.method).toBe("POST");
        return mockJson({ access_token: `${user.role}-token`, token_type: "bearer", user });
      }
      if (url.endsWith(expectedListPath)) {
        expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${user.role}-token`);
        return mockJson([]);
      }
      return mockJson({ detail: { message: `Unexpected request: ${url}` } }, 500);
    });
    renderApp("/login");

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "LabelHubPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: /登\s*录/ }));

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(localStorage.getItem("labelhub.accessToken")).toBe(`${user.role}-token`);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows invalid credential errors without storing a token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJson({ detail: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }, 401),
    );
    renderApp("/login");

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "bad-password" } });
    fireEvent.click(screen.getByRole("button", { name: /登\s*录/ }));

    expect(await screen.findByText("邮箱或密码不正确。")).toBeInTheDocument();
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
    expect(localStorage.getItem("labelhub.accessToken")).toBeNull();
  });

  it("uses /auth/me for stored tokens and redirects mismatched roles to their own route", async () => {
    localStorage.setItem("labelhub.accessToken", "labeler-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer labeler-token");
        return mockJson(labelerUser);
      }
      if (url.endsWith("/labeler/tasks")) {
        return mockJson([]);
      }
      return mockJson({ detail: { message: `Unexpected request: ${url}` } }, 500);
    });

    renderApp("/owner/tasks");

    expect(await screen.findByRole("heading", { name: "标注任务" })).toBeInTheDocument();
  });

  it("logs out by clearing the stored token and returning to login", async () => {
    localStorage.setItem("labelhub.accessToken", "owner-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return mockJson(ownerUser);
      }
      if (url.endsWith("/tasks")) {
        return mockJson([]);
      }
      return mockJson({ detail: { message: `Unexpected request: ${url}` } }, 500);
    });
    renderApp("/owner/tasks");

    expect(await screen.findByRole("heading", { name: "负责人任务" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(localStorage.getItem("labelhub.accessToken")).toBeNull());
    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });
});
