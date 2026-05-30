import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaRenderer } from "./SchemaRenderer";
import type { TemplateSchemaDocument } from "./types";

const schema: TemplateSchemaDocument = {
  version: 1,
  title: "Sentiment review",
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

describe("SchemaRenderer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("displays show_item values from item payload", () => {
    render(
      <SchemaRenderer
        schema={schema}
        item={{ payload: { text: "The response solved the customer issue." } }}
      />,
    );

    expect(screen.getByText("The response solved the customer issue.")).toBeInTheDocument();
  });

  it("validates required fields before submit", () => {
    const onSubmit = vi.fn();
    render(
      <SchemaRenderer
        schema={schema}
        item={{ payload: { text: "Needs a label" } }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /提\s*交/ }));

    expect(screen.getByText("请填写Sentiment")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Positive"));
    fireEvent.click(screen.getByRole("button", { name: /提\s*交/ }));

    expect(onSubmit).toHaveBeenCalledWith({ sentiment: "positive" });
  });

  it("submits rich text and uploaded media answers in the expected shape", async () => {
    localStorage.setItem("labelhub.accessToken", "token");
    const onSubmit = vi.fn();
    const uploadResponses = {
      "shot.png": {
        id: "asset-image",
        filename: "shot.png",
        content_type: "image/png",
        size_bytes: 7,
        download_url: "/uploads/asset-image/download",
      },
      "evidence.txt": {
        id: "asset-file",
        filename: "evidence.txt",
        content_type: "text/plain",
        size_bytes: 8,
        download_url: "/uploads/asset-file/download",
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      return Promise.resolve(
        new Response(JSON.stringify(uploadResponses[file.name as keyof typeof uploadResponses]), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const mediaSchema: TemplateSchemaDocument = {
      ...schema,
      fields: [
        { id: "rationale", type: "rich_text", label: "Rationale", required: true, minLength: 3, maxLength: 200 },
        {
          id: "screenshots",
          type: "image_upload",
          label: "Screenshots",
          required: true,
          acceptedMimeTypes: ["image/png"],
          maxFileSizeBytes: 1024,
          maxCount: 2,
        },
        {
          id: "attachments",
          type: "file_upload",
          label: "Attachments",
          acceptedMimeTypes: ["text/plain"],
          acceptedExtensions: [".txt"],
          maxFileSizeBytes: 1024,
          maxCount: 1,
        },
      ],
    };

    render(
      <SchemaRenderer
        schema={mediaSchema}
        item={{ payload: { text: "Needs evidence" } }}
        uploadContext={{ assignmentId: "assignment-1" }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Rationale"), {
      target: { value: "**Good** evidence" },
    });
    fireEvent.change(screen.getByLabelText("上传 Screenshots"), {
      target: { files: [new File(["preview"], "shot.png", { type: "image/png" })] },
    });
    fireEvent.change(screen.getByLabelText("上传 Attachments"), {
      target: { files: [new File(["evidence"], "evidence.txt", { type: "text/plain" })] },
    });

    await screen.findByText("shot.png");
    await screen.findByText("evidence.txt");
    fireEvent.click(screen.getByRole("button", { name: /提\s*交/ }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        rationale: {
          format: "markdown",
          content: "**Good** evidence",
          plainText: "Good evidence",
        },
        screenshots: [
          {
            assetId: "asset-image",
            filename: "shot.png",
            contentType: "image/png",
            sizeBytes: 7,
            downloadUrl: "/uploads/asset-image/download",
          },
        ],
        attachments: [
          {
            assetId: "asset-file",
            filename: "evidence.txt",
            contentType: "text/plain",
            sizeBytes: 8,
            downloadUrl: "/uploads/asset-file/download",
          },
        ],
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/labeler/assignments/assignment-1/uploads"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
});
