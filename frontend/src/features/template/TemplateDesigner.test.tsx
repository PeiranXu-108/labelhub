import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TemplateDesigner, validateTemplateSchema } from "./TemplateDesigner";
import type { TemplateSchemaDocument } from "../schema-renderer";

const baseSchema: TemplateSchemaDocument = {
  version: 1,
  title: "Builder test schema",
  layout: { type: "single", groups: [] },
  fields: [
    {
      id: "raw_text",
      type: "show_item",
      label: "Raw text",
      source: "item.payload.text",
    },
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
};

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn((type?: string) => {
      if (type) {
        values.delete(type);
        return;
      }
      values.clear();
    }),
    getData: vi.fn((type: string) => values.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      values.set(type, value);
    }),
    setDragImage: vi.fn(),
  };
}

function latestSchema(onChange: ReturnType<typeof vi.fn>): TemplateSchemaDocument {
  const lastCall = onChange.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error("Expected designer onChange to be called");
  }
  return lastCall[0] as TemplateSchemaDocument;
}

describe("TemplateDesigner", () => {
  it("adds a field by dropping a palette item onto the canvas", () => {
    const onChange = vi.fn();
    render(
      <TemplateDesigner
        initialSchema={{ ...baseSchema, fields: [] }}
        onChange={onChange}
      />,
    );

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "添加单行文本" }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByLabelText("字段画布"), { dataTransfer });

    expect(screen.getByText("单行文本字段")).toBeInTheDocument();
    expect(latestSchema(onChange).fields).toEqual([
      expect.objectContaining({ id: "text_1", type: "text", label: "单行文本字段" }),
    ]);
    expect(validateTemplateSchema(latestSchema(onChange))).toEqual([]);
  });

  it("reorders fields without changing their stable ids", () => {
    const onChange = vi.fn();
    render(<TemplateDesigner initialSchema={baseSchema} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "上移 Sentiment" }));

    expect(latestSchema(onChange).fields.map((field) => field.id)).toEqual([
      "sentiment",
      "raw_text",
    ]);
  });

  it("edits common and text-specific properties", () => {
    const onChange = vi.fn();
    render(
      <TemplateDesigner
        initialSchema={{
          ...baseSchema,
          fields: [{ id: "comment", type: "text", label: "Comment", required: false }],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("字段 ID"), { target: { value: "review_comment" } });
    fireEvent.change(screen.getByLabelText("字段标签"), { target: { value: "Review comment" } });
    fireEvent.change(screen.getByLabelText("帮助文本"), { target: { value: "Use the rubric." } });
    fireEvent.change(screen.getByLabelText("占位提示"), { target: { value: "Write the rationale" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "必填" }));

    expect(latestSchema(onChange).fields[0]).toEqual(
      expect.objectContaining({
        id: "review_comment",
        label: "Review comment",
        helpText: "Use the rubric.",
        placeholder: "Write the rationale",
        required: true,
      }),
    );
  });

  it("edits rich media field constraints", () => {
    const onChange = vi.fn();
    render(
      <TemplateDesigner
        initialSchema={{
          ...baseSchema,
          fields: [
            {
              id: "screenshots",
              type: "image_upload",
              label: "Screenshots",
              acceptedMimeTypes: ["image/png"],
              maxFileSizeBytes: 1048576,
              maxCount: 2,
            },
          ],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("允许 MIME 类型"), {
      target: { value: "image/png,image/jpeg" },
    });
    fireEvent.change(screen.getByLabelText("最大文件字节数"), {
      target: { value: "2097152" },
    });
    fireEvent.change(screen.getByLabelText("最大文件数"), {
      target: { value: "3" },
    });

    expect(latestSchema(onChange).fields[0]).toEqual(
      expect.objectContaining({
        type: "image_upload",
        acceptedMimeTypes: ["image/png", "image/jpeg"],
        maxFileSizeBytes: 2097152,
        maxCount: 3,
      }),
    );
  });

  it("rejects duplicate option values before save or publish", () => {
    const onChange = vi.fn();
    render(<TemplateDesigner initialSchema={baseSchema} onChange={onChange} />);

    fireEvent.click(screen.getByText("Sentiment"));
    fireEvent.change(screen.getByLabelText("选项 2 值"), { target: { value: "positive" } });

    expect(screen.getByText("sentiment 的选项值不能重复")).toBeInTheDocument();
    expect(validateTemplateSchema(latestSchema(onChange))).toContain(
      "sentiment 的选项值不能重复",
    );
  });

  it("rejects backend max-length violations before save or publish", () => {
    const long64Plus = `f${"x".repeat(64)}`;
    const long255Plus = "x".repeat(256);
    const longTarget = `target_${"x".repeat(64)}`;
    const schema: TemplateSchemaDocument = {
      ...baseSchema,
      title: long255Plus,
      fields: [
        {
          id: long64Plus,
          type: "show_item",
          label: long255Plus,
          source: `item.payload.${"x".repeat(256)}`,
        },
        {
          id: "category",
          type: "select",
          label: "Category",
          options: [{ label: long255Plus, value: long255Plus }],
        },
        {
          id: "assist",
          type: "llm_trigger",
          label: "Assist",
          promptTemplate: "Summarize {{item.payload.text}}",
          targetFieldId: longTarget,
        },
      ],
    };

    expect(validateTemplateSchema(schema)).toEqual(
      expect.arrayContaining([
        "模板标题不能超过 255 个字符",
        `${long64Plus} 的字段 ID 不能超过 64 个字符`,
        `${long64Plus} 的标签不能超过 255 个字符`,
        `${long64Plus} 的数据源路径不能超过 255 个字符`,
        "category 的选项 1 标签不能超过 255 个字符",
        "category 的选项 1 值不能超过 255 个字符",
        "assist 的目标字段不能超过 64 个字符",
      ]),
    );
  });

  it("rejects upload constraint list sizes that exceed backend limits", () => {
    const mimeTypes = Array.from({ length: 21 }, (_, index) => `application/x-labelhub-${index}`);
    const extensions = Array.from({ length: 21 }, (_, index) => `.lh${index}`);
    const schema: TemplateSchemaDocument = {
      ...baseSchema,
      fields: [
        {
          id: "attachments",
          type: "file_upload",
          label: "Attachments",
          acceptedMimeTypes: mimeTypes,
          acceptedExtensions: extensions,
          maxFileSizeBytes: 1048576,
          maxCount: 1,
        },
      ],
    };

    expect(validateTemplateSchema(schema)).toEqual(
      expect.arrayContaining([
        "attachments 的 MIME 类型不能超过 20 个",
        "attachments 的扩展名不能超过 20 个",
      ]),
    );
  });

  it("ignores canvas drops without LabelHub drag payloads", () => {
    const onChange = vi.fn();
    render(<TemplateDesigner initialSchema={baseSchema} onChange={onChange} />);

    fireEvent.drop(screen.getByLabelText("字段画布"), { dataTransfer: createDataTransfer() });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("deletes the selected field and selects a stable neighbor", () => {
    const onChange = vi.fn();
    render(
      <TemplateDesigner
        initialSchema={{
          ...baseSchema,
          fields: [
            { id: "comment", type: "text", label: "Comment", required: false },
            { id: "score", type: "number", label: "Score", required: false },
          ],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除 Comment" }));

    expect(latestSchema(onChange).fields.map((field) => field.id)).toEqual(["score"]);
    expect(screen.getByLabelText("字段 ID")).toHaveValue("score");
  });

  it("renders preview mode with the current schema", () => {
    render(
      <TemplateDesigner
        initialSchema={{
          ...baseSchema,
          fields: [
            {
              id: "source",
              type: "show_item",
              label: "Source",
              source: "item.payload.text",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByText("预览"));

    expect(screen.getByText("预览数据项文本")).toBeInTheDocument();
  });

  it("accepts every backend-supported MVP field shape", () => {
    const schema: TemplateSchemaDocument = {
      ...baseSchema,
      fields: [
        { id: "source", type: "show_item", label: "Source", source: "item.payload.text" },
        { id: "short_answer", type: "text", label: "Short answer", minLength: 1, maxLength: 120 },
        { id: "notes", type: "textarea", label: "Notes", placeholder: "Explain the decision" },
        { id: "score", type: "number", label: "Score", min: 0, max: 100 },
        {
          id: "sentiment",
          type: "radio",
          label: "Sentiment",
          options: [
            { label: "Positive", value: "positive" },
            { label: "Negative", value: "negative" },
          ],
        },
        {
          id: "issues",
          type: "checkbox_group",
          label: "Issues",
          options: [
            { label: "Tone", value: "tone" },
            { label: "Accuracy", value: "accuracy" },
          ],
        },
        {
          id: "priority",
          type: "select",
          label: "Priority",
          options: [
            { label: "High", value: "high" },
            { label: "Low", value: "low" },
          ],
        },
        { id: "quality", type: "rating", label: "Quality", min: 1, max: 5 },
        { id: "metadata", type: "json", label: "Metadata" },
        {
          id: "rationale",
          type: "rich_text",
          label: "Rationale",
          placeholder: "Use safe markdown",
          minLength: 3,
          maxLength: 500,
        },
        {
          id: "screenshots",
          type: "image_upload",
          label: "Screenshots",
          acceptedMimeTypes: ["image/png", "image/jpeg"],
          maxFileSizeBytes: 1048576,
          maxCount: 2,
        },
        {
          id: "attachments",
          type: "file_upload",
          label: "Attachments",
          acceptedMimeTypes: ["application/pdf", "text/plain"],
          acceptedExtensions: [".pdf", ".txt"],
          maxFileSizeBytes: 2097152,
          maxCount: 3,
        },
        {
          id: "assist",
          type: "llm_trigger",
          label: "Assist",
          promptTemplate: "Summarize {{item.payload.text}}",
          targetFieldId: "notes",
        },
      ],
    };

    expect(validateTemplateSchema(schema)).toEqual([]);
  });
});
