import { Descriptions, Space, Tag, Typography } from "antd";

import { StudioPanel } from "../studio";
import type { QualityRule, RewardRule, TaskRead } from "../owner/types";

type TaskMetadataPanelProps = {
  task: TaskRead;
  title?: string;
};

export function TaskMetadataPanel({ task, title = "任务元数据" }: TaskMetadataPanelProps) {
  const reward = formatRewardRule(task.reward_rule);
  const hasInstructions = Boolean(task.instruction_plain_text);
  const hasTags = task.tags.length > 0;
  const hasQualityRules = task.quality_rules.length > 0;

  return (
    <StudioPanel title={title}>
      <div className="task-metadata-stack">
        <div className="task-metadata-section">
          <Typography.Text strong>任务说明</Typography.Text>
          {hasInstructions ? (
            <Typography.Paragraph className="task-instructions">
              {task.instruction_plain_text}
            </Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">暂无标注说明</Typography.Text>
          )}
        </div>

        <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="标签">
            {hasTags ? (
              <Space wrap>
                {task.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </Space>
            ) : (
              "无"
            )}
          </Descriptions.Item>
          <Descriptions.Item label="奖励规则">{reward}</Descriptions.Item>
          {task.reward_rule.description ? (
            <Descriptions.Item label="奖励说明">
              {task.reward_rule.description}
            </Descriptions.Item>
          ) : null}
        </Descriptions>

        {hasQualityRules ? (
          <div className="quality-rule-list">
            {task.quality_rules.map((rule, index) => (
              <Typography.Text key={`${rule.label}-${index}`}>
                {formatQualityRule(rule)}
              </Typography.Text>
            ))}
          </div>
        ) : null}
      </div>
    </StudioPanel>
  );
}

export function formatRewardRule(rule: RewardRule) {
  if (rule.mode === "fixed_per_accepted_submission") {
    return `${rule.currency} ${rule.amount} / 通过提交`;
  }
  if (rule.mode === "manual") {
    return `${rule.currency} 手动规则`;
  }
  return "无奖励规则";
}

export function formatQualityRule(rule: QualityRule) {
  return `${rule.label}: ${rule.description}`;
}
