import { Table, Tag } from "antd";

import { TaskAgentWorkflowSummary } from "../agent-workflow/TaskAgentWorkflowSummary";
import type { TaskAgentWorkflowSummaryRead } from "../agent-workflow/types";
import { formatLabel } from "../i18n/labels";
import { MetricStrip, StudioPanel } from "../studio";
import { TaskMetadataPanel } from "../task-metadata/TaskMetadataPanel";
import type { ExportJobRead, TaskItemRead, TaskMetricRead, TaskRead, TemplateSchemaRead } from "./types";

type TaskDashboardProps = {
  task: TaskRead;
  items: TaskItemRead[];
  template: TemplateSchemaRead | null;
  exports: ExportJobRead[];
  agentWorkflow: TaskAgentWorkflowSummaryRead | null;
  metrics: TaskMetricRead | null;
};

export function TaskDashboard({ task, items, template, exports, agentWorkflow, metrics }: TaskDashboardProps) {
  const itemStatusCounts = countBy(items.map((item) => item.status));
  const exportStatusCounts = countBy(exports.map((job) => job.status));
  const submissionStatusCounts = countsToRows(metrics?.submission_status_counts ?? {});
  const aiDecisionCounts = countsToRows(metrics?.ai_decision_counts ?? {});
  const itemCount = metrics?.item_count ?? items.length;
  const submittedCount = metrics?.submitted_count ?? 0;
  const currentWeekSubmittedCount = metrics?.current_week_submitted_count ?? 0;
  const progressPercent = metrics?.progress_percent ?? 0;
  const aiDecisionTotal = aiDecisionCounts.reduce((total, row) => total + row.count, 0);

  return (
    <div className="dashboard-stack">
      <StudioPanel title="结果看板" className="ops-card">
        <MetricStrip
          items={[
            { label: "已导入数据项", value: itemCount, tone: "accent" },
            { label: "提交进度", value: `${progressPercent}%`, detail: `${submittedCount}/${itemCount} 已提交`, tone: "good" },
            { label: "本周提交", value: currentWeekSubmittedCount },
            { label: "模板版本", value: template?.version ?? 0 },
            { label: "AI 决策", value: aiDecisionTotal },
            { label: "导出任务", value: exports.length },
            { label: "任务状态", value: formatLabel(task.status), tone: task.status === "published" ? "good" : "neutral" },
          ]}
        />
        <div className="dashboard-tables">
          <Table
            columns={[
              { title: "数据项状态", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
              { title: "数量", dataIndex: "count", key: "count" },
            ]}
            dataSource={itemStatusCounts}
            pagination={false}
            rowKey="status"
            scroll={{ x: "max-content" }}
            size="small"
          />
          <Table
            columns={[
              { title: "提交状态", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
              { title: "数量", dataIndex: "count", key: "count" },
            ]}
            dataSource={submissionStatusCounts}
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
            dataSource={aiDecisionCounts}
            pagination={false}
            rowKey="status"
            scroll={{ x: "max-content" }}
            size="small"
          />
          <Table
            columns={[
              { title: "导出状态", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
              { title: "数量", dataIndex: "count", key: "count" },
            ]}
            dataSource={exportStatusCounts}
            pagination={false}
            rowKey="status"
            scroll={{ x: "max-content" }}
            size="small"
          />
        </div>
      </StudioPanel>
      <TaskMetadataPanel task={task} />
      <TaskAgentWorkflowSummary summary={agentWorkflow} />
    </div>
  );
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts, ([status, count]) => ({ status, count }));
}

function countsToRows(counts: Record<string, number>) {
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}
