import { Alert, Button, Drawer, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { useEffect } from "react";

import type { QualityRule, RewardRule, TaskCreate, TaskRead } from "./types";

type TaskDrawerProps = {
  open: boolean;
  task?: TaskRead | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskCreate, intent: "save" | "continue") => Promise<void>;
};

type TaskFormValues = {
  name: string;
  description?: string;
  instruction_content?: string;
  tags_text?: string;
  reward_mode?: RewardRule["mode"];
  reward_currency?: string;
  reward_amount?: string | number | null;
  reward_description?: string;
  quality_rules_text?: string;
  distribution_strategy?: string;
  quota_per_labeler?: number | null;
  deadline_at?: string;
};

export function TaskDrawer({ open, task, submitting, onClose, onSubmit }: TaskDrawerProps) {
  const [form] = Form.useForm<TaskFormValues>();
  const isEditing = Boolean(task);
  const rewardMode = Form.useWatch("reward_mode", form) ?? task?.reward_rule.mode ?? "none";

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      name: task?.name ?? "",
      description: task?.description ?? "",
      instruction_content: task?.instruction_rich_text?.content ?? "",
      tags_text: task?.tags.join(", ") ?? "",
      reward_mode: task?.reward_rule.mode ?? "none",
      reward_currency: task?.reward_rule.currency ?? "",
      reward_amount: task?.reward_rule.amount ?? null,
      reward_description: task?.reward_rule.description ?? "",
      quality_rules_text: qualityRulesToText(task?.quality_rules ?? []),
      distribution_strategy: task?.distribution_strategy ?? "manual",
      quota_per_labeler: task?.quota_per_labeler ?? null,
      deadline_at: task?.deadline_at ? task.deadline_at.slice(0, 16) : "",
    });
  }, [form, open, task]);

  async function submitWithIntent(intent: "save" | "continue") {
    const values = await form.validateFields();
    const instructionContent = normalizeOptional(values.instruction_content);
    await onSubmit({
      name: values.name.trim(),
      description: normalizeOptional(values.description),
      instruction_rich_text: instructionContent
        ? { format: "markdown", content: instructionContent }
        : null,
      instruction_plain_text: instructionContent ? derivePlainText(instructionContent) : null,
      tags: parseTags(values.tags_text),
      reward_rule: buildRewardRule(values),
      quality_rules: parseQualityRules(values.quality_rules_text),
      distribution_strategy: values.distribution_strategy ?? "manual",
      quota_per_labeler: values.quota_per_labeler ?? null,
      deadline_at: values.deadline_at ? new Date(values.deadline_at).toISOString() : null,
    }, intent);
  }

  return (
    <Drawer
      destroyOnClose
      open={open}
      title={isEditing ? "编辑任务" : "新建任务"}
      width={420}
      onClose={onClose}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
        </Form.Item>
        <Form.Item label="标注说明" name="instruction_content">
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
        </Form.Item>
        <Form.Item label="标签" name="tags_text">
          <Input placeholder="support, urgent" />
        </Form.Item>
        <Form.Item label="质量规则" name="quality_rules_text">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Evidence: cite source text" />
        </Form.Item>
        <Form.Item label="分发方式" name="distribution_strategy">
          <Select
            options={[
              { label: "手动分配", value: "manual" },
              { label: "自动认领", value: "auto_claim" },
            ]}
          />
        </Form.Item>
        <Form.Item label="每位标注员配额" name="quota_per_labeler">
          <InputNumber min={1} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="截止时间" name="deadline_at">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item label="标注模板">
          <Space direction="vertical" size={8}>
            <Select
              disabled
              placeholder={isEditing ? "在任务详情的模板标签页发布模板" : "创建任务后进入模板标签页配置"}
            />
            <Typography.Text type="secondary">
              {isEditing
                ? "保存后进入配置页，可在模板标签页选择、保存并发布模板。"
                : "模板字段高级编排由 Task22 接管；当前流程先保存草稿，再进入任务详情配置。"}
            </Typography.Text>
          </Space>
        </Form.Item>
        <Form.Item label="AI 预审">
          <Space direction="vertical" size={8}>
            <Switch checked disabled />
            <Typography.Text type="secondary">
              AI 预审阈值和模型在任务详情的审核配置中维护；任务级启停开关依赖后端配置合同。
            </Typography.Text>
          </Space>
        </Form.Item>
        <Form.Item label="奖励模式" name="reward_mode">
          <Select
            options={[
              { label: "无奖励", value: "none" },
              { label: "固定通过计件", value: "fixed_per_accepted_submission" },
              { label: "手动规则", value: "manual" },
            ]}
          />
        </Form.Item>
        {rewardMode !== "none" ? (
          <>
            <Form.Item label="币种" name="reward_currency">
              <Input maxLength={3} placeholder="USD" />
            </Form.Item>
            {rewardMode === "fixed_per_accepted_submission" ? (
              <Form.Item label="单条奖励金额" name="reward_amount">
                <InputNumber min={0} precision={2} stringMode style={{ width: "100%" }} />
              </Form.Item>
            ) : null}
            <Form.Item label="奖励说明" name="reward_description">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
          </>
        ) : null}
        <Alert
          className="section-alert"
          message="发布任务仍需在详情页完成数据导入和模板发布，发布按钮会继续使用后端 WorkflowService 校验。"
          type="info"
          showIcon
        />
        <div className="drawer-actions">
          <Button onClick={onClose}>取消</Button>
          <Button loading={submitting} onClick={() => void submitWithIntent("save")}>
            {isEditing ? "保存修改" : "保存草稿"}
          </Button>
          <Button loading={submitting} type="primary" onClick={() => void submitWithIntent("continue")}>
            {isEditing ? "保存并进入配置" : "创建并配置"}
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

function normalizeOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseTags(value?: string) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/\s+/g, " ").toLowerCase())
    .filter(Boolean);
}

function buildRewardRule(values: TaskFormValues): RewardRule {
  const mode = values.reward_mode ?? "none";
  if (mode === "none") {
    return { mode: "none", currency: null, amount: null, description: null };
  }
  const currency = normalizeOptional(values.reward_currency)?.toUpperCase() ?? null;
  const description = normalizeOptional(values.reward_description);
  if (mode === "fixed_per_accepted_submission") {
    return {
      mode,
      currency,
      amount: normalizeRewardAmount(values.reward_amount),
      description,
    };
  }
  return { mode, currency, amount: null, description };
}

function normalizeRewardAmount(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : String(value);
}

function parseQualityRules(value?: string): QualityRule[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf(":");
      if (separator > 0) {
        return {
          label: line.slice(0, separator).trim(),
          description: line.slice(separator + 1).trim(),
        };
      }
      return { label: `Rule ${index + 1}`, description: line };
    })
    .filter((rule) => rule.label && rule.description);
}

function qualityRulesToText(rules: QualityRule[]) {
  return rules.map((rule) => `${rule.label}: ${rule.description}`).join("\n");
}

function derivePlainText(markdown: string) {
  const normalized = markdown.replace(/[*_`>#\-\[\]\(\)!]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.replace(/\s+([.,;:!?])/g, "$1") || null;
}
