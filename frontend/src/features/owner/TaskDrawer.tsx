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
      title={isEditing ? "Edit task" : "New task"}
      width={420}
      onClose={onClose}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
        </Form.Item>
        <Form.Item label="Distribution strategy" name="distribution_strategy">
          <Select
            options={[
              { label: "Manual", value: "manual" },
              { label: "Auto claim", value: "auto_claim" },
            ]}
          />
        </Form.Item>
        <Form.Item label="Quota per labeler" name="quota_per_labeler">
          <InputNumber min={1} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Deadline" name="deadline_at">
          <Input type="datetime-local" />
        </Form.Item>
        <div className="drawer-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button htmlType="submit" loading={submitting} type="primary">
            {isEditing ? "Save task" : "Create task"}
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
