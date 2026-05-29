import { Statistic, Table, Tag, Typography } from "antd";

import { TaskAgentWorkflowSummary } from "../agent-workflow/TaskAgentWorkflowSummary";
import type { TaskAgentWorkflowSummaryRead } from "../agent-workflow/types";
import { formatLabel } from "../i18n/labels";
import type { ExportJobRead, TaskItemRead, TaskRead, TemplateSchemaRead } from "./types";

type TaskDashboardProps = {
  task: TaskRead;
  items: TaskItemRead[];
  template: TemplateSchemaRead | null;
  exports: ExportJobRead[];
  agentWorkflow: TaskAgentWorkflowSummaryRead | null;
};

export function TaskDashboard({ task, items, template, exports, agentWorkflow }: TaskDashboardProps) {
  const itemStatusCounts = countBy(items.map((item) => item.status));
  const exportStatusCounts = countBy(exports.map((job) => job.status));

  return (
    <div className="dashboard-stack">
      <section className="ops-card" aria-labelledby="result-dashboard-heading">
        <Typography.Title id="result-dashboard-heading" level={3}>
          结果看板
        </Typography.Title>
        <div className="metric-grid">
          <Statistic title="已导入数据项" value={items.length} />
          <Statistic title="模板版本" value={template?.version ?? 0} />
          <Statistic title="导出任务" value={exports.length} />
          <Statistic title="任务状态" value={formatLabel(task.status)} />
        </div>
        <div className="dashboard-tables">
          <Table
            columns={[
              { title: "数据项状态", dataIndex: "status", key: "status", render: (status) => <Tag>{formatLabel(status)}</Tag> },
              { title: "数量", dataIndex: "count", key: "count" },
            ]}
            dataSource={itemStatusCounts}
            pagination={false}
            rowKey="status"
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
            size="small"
          />
        </div>
      </section>
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
