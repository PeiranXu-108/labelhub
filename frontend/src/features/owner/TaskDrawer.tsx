import { Button, Drawer, Form, Input, InputNumber, Select } from "antd";
import { useEffect } from "react";

import type { TaskCreate, TaskRead } from "./types";

type TaskDrawerProps = {
  open: boolean;
  task?: TaskRead | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskCreate) => Promise<void>;
};

type TaskFormValues = {
  name: string;
  description?: string;
  distribution_strategy?: string;
  quota_per_labeler?: number | null;
  deadline_at?: string;
};

export function TaskDrawer({ open, task, submitting, onClose, onSubmit }: TaskDrawerProps) {
  const [form] = Form.useForm<TaskFormValues>();
  const isEditing = Boolean(task);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      name: task?.name ?? "",
      description: task?.description ?? "",
      distribution_strategy: task?.distribution_strategy ?? "manual",
      quota_per_labeler: task?.quota_per_labeler ?? null,
      deadline_at: task?.deadline_at ? task.deadline_at.slice(0, 16) : "",
    });
  }, [form, open, task]);

  async function handleFinish(values: TaskFormValues) {
    await onSubmit({
      name: values.name.trim(),
      description: normalizeOptional(values.description),
      distribution_strategy: values.distribution_strategy ?? "manual",
      quota_per_labeler: values.quota_per_labeler ?? null,
      deadline_at: values.deadline_at ? new Date(values.deadline_at).toISOString() : null,
    });
  }

  return (
    <Drawer
      destroyOnClose
      open={open}
      title={isEditing ? "编辑任务" : "新建任务"}
      width={420}
      onClose={onClose}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
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
        <div className="drawer-actions">
          <Button onClick={onClose}>取消</Button>
          <Button htmlType="submit" loading={submitting} type="primary">
            {isEditing ? "保存任务" : "创建任务"}
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
