import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatasetImportPanel } from "./DatasetImportPanel";

describe("DatasetImportPanel", () => {
  beforeEach(() => {
    localStorage.setItem("labelhub.accessToken", "owner-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("previews a JSONL file and submits edited valid rows", async () => {
    const onImported = vi.fn();
    let previewBody: Record<string, unknown> | null = null;
    let importBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks/task-1/items/import/preview")) {
        previewBody = JSON.parse(String(init?.body));
        return jsonResponse({
          rows: [
            {
              row_number: 4,
              external_id: "row-4",
              payload: { text: "from jsonl", source: "upload" },
              errors: [],
              warnings: [],
            },
          ],
          errors: [],
          valid_count: 1,
          invalid_count: 0,
          limits: { max_rows: 5000, max_file_bytes: 5242880 },
        });
      }
      if (String(input).endsWith("/tasks/task-1/items/import")) {
        importBody = JSON.parse(String(init?.body));
        return jsonResponse([
          {
            id: "item-1",
            task_id: "task-1",
            external_id: "row-4-edited",
            payload: { text: "edited text", source: "upload" },
            status: "available",
            created_at: "2026-05-31T00:00:00Z",
          },
        ], 201);
      }
      return jsonResponse({});
    });

    render(<DatasetImportPanel taskId="task-1" onImported={onImported} />);

    fireEvent.click(screen.getByLabelText("文件上传"));
    fireEvent.change(screen.getByLabelText("上传数据文件"), {
      target: {
        files: [
          new File(['{"external_id":"row-4","payload":{"text":"from jsonl"}}'], "rows.jsonl", {
            type: "application/x-ndjson",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

    await waitFor(() => expect(previewBody).not.toBeNull());
    expect(previewBody).toMatchObject({
      format: "jsonl",
      content: '{"external_id":"row-4","payload":{"text":"from jsonl"}}',
      is_base64: false,
    });

    fireEvent.change(await screen.findByLabelText("第 4 行 external_id"), {
      target: { value: "row-4-edited" },
    });
    fireEvent.change(screen.getByLabelText("第 4 行 payload.text"), {
      target: { value: "edited text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交有效行" }));

    await waitFor(() => expect(importBody).not.toBeNull());
    expect(importBody).toEqual({
      items: [
        {
          external_id: "row-4-edited",
          payload: { text: "edited text", source: "upload" },
          source_row: 4,
        },
      ],
    });
    expect(onImported).toHaveBeenCalledWith([
      expect.objectContaining({ external_id: "row-4-edited" }),
    ]);
  });

  it("sends Excel mapping, removes invalid rows, and batch-renames payload keys before import", async () => {
    let previewBody: Record<string, unknown> | null = null;
    let importBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks/task-1/items/import/preview")) {
        previewBody = JSON.parse(String(init?.body));
        return jsonResponse({
          rows: [
            {
              row_number: 2,
              external_id: "sheet-1",
              payload: { text: "Support row", old_key: "A" },
              errors: [],
              warnings: [],
            },
            {
              row_number: 3,
              external_id: "bad-row",
              payload: {},
              errors: [{ row_number: 3, field: "payload", code: "INVALID_PAYLOAD", message: "Payload must be an object." }],
              warnings: [],
            },
          ],
          errors: [{ row_number: 3, field: "payload", code: "INVALID_PAYLOAD", message: "Payload must be an object." }],
          valid_count: 1,
          invalid_count: 1,
          limits: { max_rows: 5000, max_file_bytes: 5242880 },
        });
      }
      if (String(input).endsWith("/tasks/task-1/items/import")) {
        importBody = JSON.parse(String(init?.body));
        return jsonResponse([], 201);
      }
      return jsonResponse({});
    });

    render(<DatasetImportPanel taskId="task-1" onImported={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("文件上传"));
    fireEvent.change(screen.getByLabelText("上传数据文件"), {
      target: { files: [new File(["abc"], "rows.xlsx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

    await waitFor(() => expect(previewBody).not.toBeNull());
    expect(previewBody).toMatchObject({
      format: "xlsx",
      content: "YWJj",
      is_base64: true,
      excel_mapping: {
        external_id_column: "external_id",
        payload_column: "payload",
        payload_columns: null,
      },
    });

    expect(await screen.findByText("Payload must be an object.")).toBeInTheDocument();
    const invalidRow = screen.getByRole("row", { name: /bad-row/i });
    fireEvent.click(within(invalidRow).getByRole("button", { name: "移除第 3 行" }));
    fireEvent.change(screen.getByLabelText("原 Payload Key"), { target: { value: "old_key" } });
    fireEvent.change(screen.getByLabelText("新 Payload Key"), { target: { value: "new_key" } });
    fireEvent.click(screen.getByRole("button", { name: "批量重命名" }));
    fireEvent.click(screen.getByRole("button", { name: "提交有效行" }));

    await waitFor(() => expect(importBody).not.toBeNull());
    expect(importBody).toEqual({
      items: [
        {
          external_id: "sheet-1",
          payload: { text: "Support row", new_key: "A" },
          source_row: 2,
        },
      ],
    });
  });

  it("keeps backend create errors separate from preview errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/tasks/task-1/items/import/preview")) {
        return jsonResponse({
          rows: [
            {
              row_number: 2,
              external_id: "row-1",
              payload: { text: "one" },
              errors: [],
              warnings: [],
            },
          ],
          errors: [],
          valid_count: 1,
          invalid_count: 0,
          limits: { max_rows: 5000, max_file_bytes: 5242880 },
        });
      }
      if (String(input).endsWith("/tasks/task-1/items/import")) {
        return jsonResponse(
          {
            detail: {
              code: "INVALID_ITEM_IMPORT",
              message: "Import contains 1 error(s): row 2 external_id: external_id 'row-1' already exists.",
            },
          },
          400,
        );
      }
      return jsonResponse({});
    });

    render(<DatasetImportPanel taskId="task-1" onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("粘贴数据"), {
      target: { value: '[{"external_id":"row-1","payload":{"text":"one"}}]' },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成预览" }));
    fireEvent.click(await screen.findByRole("button", { name: "提交有效行" }));

    expect(await screen.findByText("后端创建错误")).toBeInTheDocument();
    expect(screen.getByText(/row 2 external_id/)).toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
