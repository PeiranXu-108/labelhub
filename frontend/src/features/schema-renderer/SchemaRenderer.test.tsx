import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Sentiment is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Positive"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({ sentiment: "positive" });
  });
});
