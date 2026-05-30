import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { publishTemplate, saveTemplateDraft } from "./api";
import { TemplateWorkspace } from "./TemplateWorkspace";
import type { TemplateSchemaRead } from "./types";

vi.mock("./api", () => ({
  publishTemplate: vi.fn(),
  saveTemplateDraft: vi.fn(),
}));

const draftTemplate: TemplateSchemaRead = {
  id: "schema-draft",
  task_id: "task-1",
  version: 1,
  title: "Draft schema",
  schema_payload: {
    version: 1,
    title: "Draft schema",
    layout: { type: "single", groups: [] },
    fields: [],
    llmTools: [],
    validations: [],
    visibilityRules: [],
  },
  is_published: false,
  created_by: "owner-1",
  created_at: "2026-05-23T00:00:00Z",
  published_at: null,
};

describe("TemplateWorkspace", () => {
  it("saves the current draft before publishing a new template", async () => {
    const publishedTemplate = {
      ...draftTemplate,
      id: "schema-published",
      is_published: true,
      published_at: "2026-05-23T00:01:00Z",
    };
    vi.mocked(saveTemplateDraft).mockResolvedValue(draftTemplate);
    vi.mocked(publishTemplate).mockResolvedValue(publishedTemplate);
    const onSaved = vi.fn();

    render(<TemplateWorkspace taskId="task-1" template={null} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "发布模板" }));

    await waitFor(() => {
      expect(saveTemplateDraft).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({
          title: "基础标注模板",
          fields: expect.arrayContaining([
            expect.objectContaining({ id: "source", type: "show_item" }),
            expect.objectContaining({ id: "answer", type: "textarea", required: true }),
          ]),
        }),
      );
    });
    expect(publishTemplate).toHaveBeenCalledWith("task-1");
    expect(onSaved).toHaveBeenLastCalledWith(publishedTemplate);
  });
});
