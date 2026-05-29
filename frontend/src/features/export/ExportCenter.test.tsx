import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExportCenter } from "./ExportCenter";

describe("ExportCenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("creates an export job with field mapping and review metadata flag", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks/task-1/exports") && init?.method === "POST") {
        return jsonResponse({
          id: "export-1",
          task_id: "task-1",
          created_by: "owner-1",
          format: "csv",
          field_mapping: { "item.payload.text": "text", "answers.sentiment": "label" },
          include_review_metadata: false,
          status: "pending",
          file_path: null,
          error_message: null,
          created_at: "2026-05-23T00:00:00Z",
          updated_at: "2026-05-23T00:00:00Z",
        }, 202);
      }
      return jsonResponse([]);
    });

    render(<ExportCenter taskId="task-1" />);

    fireEvent.change(screen.getByLabelText("字段映射 JSON"), {
      target: {
        value: JSON.stringify({
          "item.payload.text": "text",
          "answers.sentiment": "label",
        }),
      },
    });
    fireEvent.click(screen.getByLabelText("包含审核元数据"));
    fireEvent.click(screen.getByRole("button", { name: "创建导出" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks\/task-1\/exports$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            format: "csv",
            field_mapping: {
              "item.payload.text": "text",
              "answers.sentiment": "label",
            },
            include_review_metadata: false,
          }),
        }),
      );
    });
  });

  it("downloads succeeded export jobs through the authenticated API client", async () => {
    localStorage.setItem("labelhub.accessToken", "owner-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("id,label\nrow-1,positive\n", {
        status: 200,
        headers: {
          "Content-Disposition": 'attachment; filename="task-export.csv"',
          "Content-Type": "text/csv",
        },
      }),
    );
    const createObjectUrl = vi.fn(() => "blob:task-export");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });

    render(
      <ExportCenter
        taskId="task-1"
        jobs={[
          {
            id: "export-1",
            task_id: "task-1",
            created_by: "owner-1",
            format: "csv",
            field_mapping: {},
            include_review_metadata: true,
            status: "succeeded",
            file_path: "storage/exports/task-1/task-export.csv",
            error_message: null,
            created_at: "2026-05-23T00:00:00Z",
            updated_at: "2026-05-23T00:00:00Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /下\s*载/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/exports\/export-1\/download$/),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer owner-token",
          }),
        }),
      );
    });
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:task-export");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
