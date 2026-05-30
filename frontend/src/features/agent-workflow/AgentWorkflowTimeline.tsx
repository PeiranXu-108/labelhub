import { ThoughtChain } from "@ant-design/x/lib";
import { Alert, Descriptions, Space, Tag, Typography } from "antd";

import type { AgentWorkflowRead, AgentWorkflowStepRead } from "./types";
import { formatKnownText, formatLabel } from "../i18n/labels";
import { StatusPill, StudioPanel } from "../studio";
import { workflowThoughtItems } from "../studio/assistant";

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
    <StudioPanel
      className="ops-card agent-workflow-panel"
      title="Agent 工作流"
      description={`当前状态：${formatLabel(workflow.current_status)}`}
      actions={<StatusPill status={workflow.current_status}>{formatLabel(workflow.current_status)}</StatusPill>}
    >
      <ThoughtChain
        className="agent-thought-surface"
        items={workflowThoughtItems(
          visibleSteps.map((step) => ({
            key: step.key,
            label: (
              <Space wrap>
                <Typography.Text strong>{formatKnownText(step.label)}</Typography.Text>
                <Tag color={statusColors[step.status] ?? "default"}>{formatLabel(step.status)}</Tag>
                {step.actor_role ? <Tag>{formatLabel(step.actor_role)}</Tag> : null}
              </Space>
            ),
            status: step.status,
            summary: <AgentWorkflowStep step={step} compact={compact} showHeader={false} />,
          })),
        )}
        size={compact ? "small" : "middle"}
      />
    </StudioPanel>
  );
}

function AgentWorkflowStep({
  step,
  compact,
  showHeader = true,
}: {
  step: AgentWorkflowStepRead;
  compact: boolean;
  showHeader?: boolean;
}) {
  return (
    <Space direction="vertical" size={compact ? 2 : 6}>
      {showHeader ? (
        <Space wrap>
          <Typography.Text strong>{formatKnownText(step.label)}</Typography.Text>
          <Tag color={statusColors[step.status] ?? "default"}>{formatLabel(step.status)}</Tag>
          {step.actor_role ? <Tag>{formatLabel(step.actor_role)}</Tag> : null}
        </Space>
      ) : null}
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

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return formatKnownText(String(value));
}
