import type { ReactNode } from "react";
import type { ThoughtChainItem } from "@ant-design/x/lib";

export type StudioPrompt = {
  key: string;
  label: string;
  description?: string;
  response: string;
};

export const defaultAssistantPrompts: StudioPrompt[] = [
  {
    key: "risk",
    label: "总结待审核风险",
    description: "聚焦低分、退回和人工复核队列",
    response: "建议先查看 AI 分数低于阈值、历史退回次数较多、以及等待人工确认的提交，再批量处理高置信通过项。",
  },
  {
    key: "template",
    label: "检查模板缺口",
    description: "检查字段、必填项和 LLM 触发器",
    response: "模板检查可以从三个点开始：字段是否覆盖业务答案、关键字段是否必填、LLM 触发器是否指向明确目标字段。",
  },
  {
    key: "export",
    label: "准备导出说明",
    description: "整理字段映射、审核元数据和产物状态",
    response: "导出前建议确认字段映射 JSON、包含审核元数据、并等待导出任务进入成功状态后再下载交付。",
  },
];

export function workflowThoughtItems(
  steps: Array<{ key: string; label: ReactNode; status: string; summary?: ReactNode; extra?: ReactNode }>,
): ThoughtChainItem[] {
  return steps.map((step) => ({
    key: step.key,
    title: step.label,
    description: step.summary,
    extra: step.extra,
    status: step.status === "failed" ? "error" : step.status === "pending" ? "pending" : "success",
  }));
}
