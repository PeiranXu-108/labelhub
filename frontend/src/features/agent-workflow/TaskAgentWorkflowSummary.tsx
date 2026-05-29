import { Statistic, Table, Tag, Typography } from "antd";

import type { TaskAgentWorkflowSummaryRead } from "./types";

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
        summary: aiStep?.summary ?? "No AI decision yet.",
        model: String(aiStep?.metadata.model_name ?? "Pending"),
      };
    }) ?? [];

  return (
    <section className="ops-card" aria-labelledby="agent-workflow-summary-heading">
      <Typography.Title id="agent-workflow-summary-heading" level={3}>
        Agent workflow
      </Typography.Title>
      <div className="metric-grid">
        <Statistic title="Pending agent work" value={summary?.pending_count ?? 0} />
        <Statistic title="Failed agent runs" value={summary?.failed_count ?? 0} />
        <Statistic title="AI decisions" value={decisionRows.reduce((total, row) => total + row.count, 0)} />
        <Statistic title="Tracked submissions" value={statusRows.reduce((total, row) => total + row.count, 0)} />
      </div>
      <div className="dashboard-tables">
        <Table
          columns={[
            { title: "Submission status", dataIndex: "status", key: "status", render: (status) => <Tag>{status}</Tag> },
            { title: "Count", dataIndex: "count", key: "count" },
          ]}
          dataSource={statusRows}
          pagination={false}
          rowKey="status"
          size="small"
        />
        <Table
          columns={[
            { title: "AI decision", dataIndex: "status", key: "status", render: (status) => <Tag>{status}</Tag> },
            { title: "Count", dataIndex: "count", key: "count" },
          ]}
          dataSource={decisionRows}
          pagination={false}
          rowKey="status"
          size="small"
        />
      </div>
      <Table
        columns={[
          { title: "Submission", dataIndex: "submission_id", key: "submission_id" },
          { title: "Status", dataIndex: "current_status", key: "current_status", render: (status) => <Tag>{status}</Tag> },
          { title: "Agent summary", dataIndex: "summary", key: "summary" },
          { title: "Model", dataIndex: "model", key: "model" },
        ]}
        dataSource={recentRows}
        pagination={false}
        rowKey="submission_id"
        size="small"
      />
    </section>
  );
}

function countRows(counts: Record<string, number> | undefined) {
  return Object.entries(counts ?? {}).map(([status, count]) => ({ status, count }));
}
