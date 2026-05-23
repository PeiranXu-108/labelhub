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
  title: "Untitled template",
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
      setError(err instanceof Error ? err.message : "Failed to save template draft.");
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
      setError(err instanceof Error ? err.message : "Failed to publish template.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="ops-card" aria-labelledby="template-heading">
      <div className="panel-toolbar compact">
        <div>
          <Typography.Title id="template-heading" level={3}>
            Template designer
          </Typography.Title>
          <Space>
            <Tag color={template?.is_published ? "green" : "gold"}>
              {template?.is_published ? "published" : "draft"}
            </Tag>
            <Typography.Text type="secondary">Version {template?.version ?? schema.version}</Typography.Text>
          </Space>
        </div>
        <Space>
          <Button loading={saving} onClick={handleSaveDraft}>
            Save draft
          </Button>
          <Button loading={publishing} type="primary" onClick={handlePublish}>
            Publish template
          </Button>
        </Space>
      </div>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <label className="schema-control template-title-control">
        <span>Template title</span>
        <Input value={schema.title} onChange={(event) => setSchema({ ...schema, title: event.target.value })} />
      </label>
      <TemplateDesigner initialSchema={schema} onChange={setSchema} />
    </section>
  );
}
