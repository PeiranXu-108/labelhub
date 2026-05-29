import { Alert, Descriptions, Space, Tag, Timeline, Typography } from "antd";

import type { AgentWorkflowRead, AgentWorkflowStepRead } from "./types";
import { formatKnownText, formatLabel } from "../i18n/labels";

type AgentWorkflowTimelineProps = {
  workflow: AgentWorkflowRead | null;
  compact?: boolean;
};

const statusColors: Record<string, string> = {
  complete: "green",
  active: "blue",
  failed: "red",
  pending: "default",
};

export function AgentWorkflowTimeline({ workflow, compact = false }: AgentWorkflowTimelineProps) {
  if (!workflow) {
    return <Alert message="Agent 工作流暂不可用。" type="info" />;
  }

  const visibleSteps = compact
    ? workflow.steps.filter((step) => step.status !== "pending").slice(-3)
    : workflow.steps;

  return (
    <section className="ops-card" aria-labelledby="agent-workflow-heading">
      <div className="panel-toolbar compact">
        <div>
          <Typography.Title id="agent-workflow-heading" level={compact ? 3 : 2}>
            Agent 工作流
          </Typography.Title>
          <Typography.Text type="secondary">当前状态：{formatLabel(workflow.current_status)}</Typography.Text>
        </div>
        <Tag>{formatLabel(workflow.current_status)}</Tag>
      </div>
      <Timeline
        items={visibleSteps.map((step) => ({
          color: timelineColor(step.status),
          children: <AgentWorkflowStep step={step} compact={compact} />,
        }))}
      />
    </section>
  );
}

function AgentWorkflowStep({ step, compact }: { step: AgentWorkflowStepRead; compact: boolean }) {
  return (
    <Space direction="vertical" size={compact ? 2 : 6}>
      <Space wrap>
        <Typography.Text strong>{formatKnownText(step.label)}</Typography.Text>
        <Tag color={statusColors[step.status] ?? "default"}>{formatLabel(step.status)}</Tag>
        {step.actor_role ? <Tag>{formatLabel(step.actor_role)}</Tag> : null}
      </Space>
      {step.summary ? <Typography.Text>{formatKnownText(step.summary)}</Typography.Text> : null}
      {step.timestamp ? (
        <Typography.Text type="secondary">{new Date(step.timestamp).toLocaleString()}</Typography.Text>
      ) : null}
      {!compact && Object.keys(step.metadata).length > 0 ? (
        <Descriptions column={1} size="small">
          {Object.entries(step.metadata).map(([key, value]) => (
            <Descriptions.Item key={key} label={formatKnownText(key)}>
              {formatMetadataValue(value)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : null}
    </Space>
  );
}

function timelineColor(status: string) {
  if (status === "complete") {
    return "green";
  }
  if (status === "active") {
    return "blue";
  }
  if (status === "failed") {
    return "red";
  }
  return "gray";
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return formatKnownText(String(value));
}
