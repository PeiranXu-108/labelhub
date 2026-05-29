const labelMap: Record<string, string> = {
  active: "进行中",
  ai_agent: "AI 代理",
  ai_passed: "AI 通过",
  ai_returned: "AI 退回",
  ai_reviewing: "AI 审核中",
  approved: "已批准",
  approve: "批准",
  authenticated: "已认证",
  auto_claim: "自动认领",
  checking: "检查中",
  complete: "已完成",
  csv: "CSV",
  draft: "草稿",
  end: "结束",
  ended: "已结束",
  error: "错误",
  exportable: "可导出",
  failed: "失败",
  human_review: "需人工审核",
  human_reviewing: "人工审核中",
  idle: "空闲",
  json: "JSON",
  jsonl: "JSONL",
  manual: "手动分配",
  needs_human_review: "待人工审核",
  none: "无",
  owner: "负责人",
  pass: "通过",
  pause: "暂停",
  paused: "已暂停",
  pending: "待处理",
  publish: "发布",
  published: "已发布",
  return: "退回",
  returned: "已退回",
  reviewer: "审核员",
  running: "运行中",
  saved: "已保存",
  saving: "保存中",
  submitted: "已提交",
  submit: "提交",
  succeeded: "成功",
  system: "系统",
  xlsx: "XLSX",
};

const workflowTextMap: Record<string, string> = {
  "AI decision": "AI 决策",
  "AI passed this submission.": "AI 已通过此提交。",
  "AI recommends returning this submission.": "AI 建议退回此提交。",
  "AI review job queued.": "AI 审核任务已排队。",
  ai_pass: "AI 通过",
  ai_return: "AI 退回",
  "AI routed this submission to human review.": "AI 已将此提交转入人工审核。",
  "AI reviewing": "AI 审核中",
  "Approved/Returned": "已批准/已退回",
  "DeepSeek agent is evaluating the submission.": "DeepSeek 代理正在评估此提交。",
  "Exportable": "可导出",
  "Human review": "人工审核",
  "Labeler submitted answers.": "标注员已提交答案。",
  "No AI decision has been persisted yet.": "尚未保存 AI 决策。",
  "No AI decision yet.": "暂无 AI 决策。",
  "No human decision yet.": "暂无人工决策。",
  "Queued": "已排队",
  "Reviewer approved this submission.": "审核员已批准此提交。",
  "Reviewer is checking the AI-routed submission.": "审核员正在检查 AI 分流的提交。",
  "Reviewer returned this submission.": "审核员已退回此提交。",
  require_human_review: "要求人工审核",
  start_ai_review: "开始 AI 审核",
  start_human_review: "开始人工审核",
  mark_exportable: "标记为可导出",
  "Submission is ready for export.": "提交已可导出。",
  "Submitted": "已提交",
  "Waiting for AI worker.": "等待 AI worker 处理。",
  "Waiting for export readiness.": "等待进入可导出状态。",
  "Waiting for labeler submission.": "等待标注员提交。",
  "Waiting for reviewer action.": "等待审核员处理。",
  "Waiting for submission.": "等待提交。",
};

export function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return labelMap[value] ?? value;
}

export function formatKnownText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return workflowTextMap[value] ?? formatLabel(value);
}
