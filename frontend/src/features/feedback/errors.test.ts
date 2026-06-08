import { describe, expect, it } from "vitest";

import { normalizeError } from "./errors";

describe("normalizeError", () => {
  it("translates known backend messages into Chinese", () => {
    expect(normalizeError(new Error("Invalid email or password"), "无法登录")).toBe("邮箱或密码不正确。");
    expect(normalizeError(new Error("Only draft submissions can be edited"), "保存失败")).toBe(
      "只有草稿状态的提交可以编辑。",
    );
    expect(normalizeError(new Error("Save a template draft before publishing"), "发布失败")).toBe(
      "请先保存模板草稿再发布。",
    );
    expect(normalizeError(new Error("Only failed AI review runs can be retried"), "重试失败")).toBe(
      "只有失败的 AI 审核运行可以重试。",
    );
  });

  it("translates backend detail codes", () => {
    expect(
      normalizeError(
        { detail: { code: "TEMPLATE_DRAFT_REQUIRED", message: undefined } },
        "发布失败",
      ),
    ).toBe("请先保存模板草稿再发布。");
  });

  it("translates workflow transition errors with localized action and status", () => {
    expect(normalizeError(new Error("Cannot apply submit to submission in submitted"), "提交失败")).toBe(
      "当前状态为已提交，不能重复提交。",
    );
  });

  it("uses Chinese fallback for unknown technical English errors", () => {
    expect(normalizeError(new Error("Unhandled http://example.test"), "加载失败")).toBe("加载失败");
    expect(normalizeError(new Error("500 Internal Server Error"), "操作失败")).toBe("操作失败");
  });
});
