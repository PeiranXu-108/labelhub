import { Alert, Button, Input, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { TemplateDesigner } from "../template";
import { publishTemplate, saveTemplateDraft } from "./api";
import type { TemplateSchemaRead } from "./types";
import type { TemplateSchemaDocument } from "../schema-renderer";

type TemplateWorkspaceProps = {
  taskId: string;
  template: TemplateSchemaRead | null;
  onSaved: (template: TemplateSchemaRead) => void;
};

const emptySchema: TemplateSchemaDocument = {
  version: 1,
  title: "未命名模板",
  layout: { type: "single", groups: [] },
  fields: [],
  llmTools: [],
  validations: [],
  visibilityRules: [],
};

export function TemplateWorkspace({ taskId, template, onSaved }: TemplateWorkspaceProps) {
  const [schema, setSchema] = useState<TemplateSchemaDocument>(template?.schema_payload ?? emptySchema);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSchema(template?.schema_payload ?? emptySchema);
  }, [template]);

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveTemplateDraft(taskId, schema));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存模板草稿失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      onSaved(await publishTemplate(taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布模板失败。");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="ops-card" aria-labelledby="template-heading">
      <div className="panel-toolbar compact">
        <div>
          <Typography.Title id="template-heading" level={3}>
            模板设计器
          </Typography.Title>
          <Space>
            <Tag color={template?.is_published ? "green" : "gold"}>
              {template?.is_published ? "已发布" : "草稿"}
            </Tag>
            <Typography.Text type="secondary">版本 {template?.version ?? schema.version}</Typography.Text>
          </Space>
        </div>
        <Space>
          <Button loading={saving} onClick={handleSaveDraft}>
            保存草稿
          </Button>
          <Button loading={publishing} type="primary" onClick={handlePublish}>
            发布模板
          </Button>
        </Space>
      </div>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <label className="schema-control template-title-control">
        <span>模板标题</span>
        <Input value={schema.title} onChange={(event) => setSchema({ ...schema, title: event.target.value })} />
      </label>
      <TemplateDesigner initialSchema={schema} onChange={setSchema} />
    </section>
  );
}
