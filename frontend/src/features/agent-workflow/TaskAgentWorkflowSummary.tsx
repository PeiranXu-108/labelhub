import { Table, Tag } from "antd";

import type { TaskAgentWorkflowSummaryRead } from "./types";
import { formatKnownText, formatLabel } from "../i18n/labels";
import { MetricStrip, StudioPanel } from "../studio";

type TaskAgentWorkflowSummaryProps = {
  summary: TaskAgentWorkflowSummaryRead | null;
};

export function TaskAgentWorkflowSummary({ summary }: TaskAgentWorkflowSummaryProps) {
  const statusRows = countRows(summary?.submission_status_counts);
  const decisionRows = countRows(summary?.ai_decision_counts);
  const recentRows =
    (summary?.recent_workflows ?? []).map((workflow) => {
      const aiStep = workflow.steps.find((step) => step.key === "ai_decision");
      return {
        submission_id: workflow.submission_id,
        current_status: workflow.current_status,
        summary: formatKnownText(aiStep?.summary ?? "No AI decision yet."),
        model: String(aiStep?.metadata.model_name ?? "待处理"),
      };
    }) ?? [];

  return (
    <StudioPanel title="Agent 工作流" className="ops-card">
      <MetricStrip
        items={[
          { label: "待处理 Agent 工作", value: summary?.pending_count ?? 0, tone: "warning" },
          { label: "失败 Agent 运行", value: summary?.failed_count ?? 0, tone: summary?.failed_count ? "danger" : "good" },
          { label: "AI 决策", value: decisionRows.reduce((total, row) => total + row.count, 0), tone: "accent" },
          { label: "已跟踪提交", value: statusRows.reduce((total, row) => total + row.count, 0) },
        ]}
      />
      <div className="dashboard-tables">
        <Table
          columns={[
            { title: "提交状态", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
            { title: "数量", dataIndex: "count", key: "count" },
          ]}
          dataSource={statusRows}
          pagination={false}
          rowKey="status"
          scroll={{ x: "max-content" }}
          size="small"
        />
        <Table
          columns={[
            { title: "AI 决策", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
            { title: "数量", dataIndex: "count", key: "count" },
          ]}
          dataSource={decisionRows}
          pagination={false}
          rowKey="status"
          scroll={{ x: "max-content" }}
          size="small"
        />
      </div>
      <Table
        columns={[
          { title: "提交", dataIndex: "submission_id", key: "submission_id" },
          { title: "状态", dataIndex: "current_status", key: "current_status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
          { title: "Agent 摘要", dataIndex: "summary", key: "summary" },
          { title: "模型", dataIndex: "model", key: "model" },
        ]}
        dataSource={recentRows}
        pagination={false}
        rowKey="submission_id"
        scroll={{ x: "max-content" }}
        size="small"
      />
    </StudioPanel>
  );
}

function countRows(counts: Record<string, number> | undefined) {
  return Object.entries(counts ?? {}).map(([status, count]) => ({ status, count }));
}
