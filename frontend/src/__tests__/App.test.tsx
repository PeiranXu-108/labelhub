import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "../App";

describe("App route placeholders", () => {
  it("renders the default app shell without crashing", () => {
    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "LabelHub" })).toBeInTheDocument();
  });

  it.each([
    ["/login", "Sign in"],
    ["/owner/tasks", "Owner tasks"],
    ["/labeler/tasks", "Labeler tasks"],
    ["/review/queue", "Review queue"],
  ])("renders %s placeholder heading", (path, heading) => {
    render(
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
