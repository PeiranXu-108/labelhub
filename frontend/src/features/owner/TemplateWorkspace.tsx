import { Button, Input, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { useOperationMessage } from "../feedback";
import { TemplateDesigner, validateTemplateSchema } from "../template";
import { publishTemplate, saveTemplateDraft } from "./api";
import { StudioPanel } from "../studio";
import type { TemplateSchemaRead } from "./types";
import type { TemplateSchemaDocument } from "../schema-renderer";

type TemplateWorkspaceProps = {
  taskId: string;
  template: TemplateSchemaRead | null;
  onSaved: (template: TemplateSchemaRead) => void;
};

const emptySchema: TemplateSchemaDocument = {
  version: 1,
  title: "基础标注模板",
  layout: { type: "single", groups: [] },
  fields: [
    {
      id: "source",
      type: "show_item",
      label: "原始数据",
      source: "item.payload.text",
    },
    {
      id: "answer",
      type: "textarea",
      label: "标注结果",
      required: true,
    },
  ],
  llmTools: [],
  validations: [],
  visibilityRules: [],
};

export function TemplateWorkspace({ taskId, template, onSaved }: TemplateWorkspaceProps) {
  const showOperationError = useOperationMessage();
  const [schema, setSchema] = useState<TemplateSchemaDocument>(template?.schema_payload ?? emptySchema);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const validationIssues = validateTemplateSchema(schema);

  useEffect(() => {
    setSchema(template?.schema_payload ?? emptySchema);
  }, [template]);

  async function handleSaveDraft() {
    if (validationIssues.length > 0) {
      return;
    }
    setSaving(true);
    try {
      onSaved(await saveTemplateDraft(taskId, schema));
    } catch (err) {
      showOperationError(err, "保存模板草稿失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (validationIssues.length > 0) {
      return;
    }
    setPublishing(true);
    try {
      await saveTemplateDraft(taskId, schema);
      onSaved(await publishTemplate(taskId));
    } catch (err) {
      showOperationError(err, "发布模板失败。");
    } finally {
      setPublishing(false);
    }
  }

  function handleExportSchemaJson() {
    const blob = new Blob([`${JSON.stringify(schema, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `template-schema-v${schema.version}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <StudioPanel className="ops-card template-workspace" title="模板设计器">
      <div className="panel-toolbar compact">
        <div>
          <Space>
            <Tag color={template?.is_published ? "green" : "gold"}>
              {template?.is_published ? "已发布" : "草稿"}
            </Tag>
            <Typography.Text type="secondary">版本 {template?.version ?? schema.version}</Typography.Text>
          </Space>
        </div>
        <Space>
          <Button onClick={handleExportSchemaJson}>导出 Schema JSON</Button>
          <Button disabled={publishing || validationIssues.length > 0} loading={saving} onClick={handleSaveDraft}>
            保存草稿
          </Button>
          <Button disabled={saving || validationIssues.length > 0} loading={publishing} type="primary" onClick={handlePublish}>
            发布模板
          </Button>
        </Space>
      </div>
      <label className="schema-control template-title-control">
        <span>模板标题</span>
        <Input value={schema.title} onChange={(event) => setSchema({ ...schema, title: event.target.value })} />
      </label>
      <TemplateDesigner initialSchema={schema} onChange={setSchema} />
    </StudioPanel>
  );
}
