import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TemplateDesigner } from "./TemplateDesigner";

describe("TemplateDesigner", () => {
  it("adds a stable text field from the palette", () => {
    const onChange = vi.fn();
    render(<TemplateDesigner onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "添加单行文本字段" }));

    expect(screen.getByText("单行文本字段")).toBeInTheDocument();
    expect(screen.getByText("text_1")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({ id: "text_1", type: "text", label: "单行文本字段" }),
        ]),
      }),
    );
  });
});
