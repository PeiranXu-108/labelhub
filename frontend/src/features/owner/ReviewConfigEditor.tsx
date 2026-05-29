import { Alert, Button, Form, Input, InputNumber, Space, Typography } from "antd";
import { useEffect, useState } from "react";

import { saveReviewConfig } from "./api";
import type { ReviewConfig } from "./types";

type ReviewConfigEditorProps = {
  taskId: string;
  config: ReviewConfig;
  onSaved: (config: ReviewConfig) => void;
};

type ReviewConfigForm = Omit<ReviewConfig, "criteria"> & {
  criteria_json: string;
};

export function ReviewConfigEditor({ taskId, config, onSaved }: ReviewConfigEditorProps) {
  const [form] = Form.useForm<ReviewConfigForm>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      ...config,
      criteria_json: JSON.stringify(config.criteria ?? [], null, 2),
    });
  }, [config, form]);

  async function handleFinish(values: ReviewConfigForm) {
    let criteria: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(values.criteria_json || "[]") as unknown;
      if (!Array.isArray(parsed)) {
        setError("Criteria must be a JSON array.");
        return;
      }
      criteria = parsed.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error(`Criterion ${index + 1} must be an object.`);
        }
        return entry as Record<string, unknown>;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Criteria must be valid JSON.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { criteria_json: _criteriaJson, ...configValues } = values;
      const saved = await saveReviewConfig(taskId, {
        ...config,
        ...configValues,
        criteria,
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review config.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ops-card" aria-labelledby="review-config-heading">
      <Typography.Title id="review-config-heading" level={3}>
        Review config
      </Typography.Title>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item label="Prompt template" name="prompt_template">
          <Input.TextArea rows={5} />
        </Form.Item>
        <Form.Item label="Scoring criteria JSON" name="criteria_json">
          <Input.TextArea rows={6} />
        </Form.Item>
        <div className="form-grid-3">
          <Form.Item label="Pass threshold" name="pass_threshold">
            <InputNumber max={100} min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Manual review threshold" name="manual_review_threshold">
            <InputNumber max={100} min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Return threshold" name="return_threshold">
            <InputNumber max={100} min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div className="form-grid-3">
          <Form.Item label="Max retries" name="max_retries">
            <InputNumber max={10} min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Space className="section-actions">
          <Button htmlType="submit" loading={submitting} type="primary">
            Save review config
          </Button>
        </Space>
      </Form>
    </section>
  );
}
