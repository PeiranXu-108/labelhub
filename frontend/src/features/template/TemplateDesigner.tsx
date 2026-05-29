import { Button, Input, Segmented, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import { SchemaRenderer } from "../schema-renderer";
import type { TemplateField, TemplateFieldType, TemplateSchemaDocument } from "../schema-renderer";

export type TemplateDesignerProps = {
  initialSchema?: TemplateSchemaDocument;
  onChange?: (schema: TemplateSchemaDocument) => void;
};

const palette: Array<{ type: TemplateFieldType; label: string }> = [
  { type: "show_item", label: "展示数据项" },
  { type: "text", label: "单行文本" },
  { type: "textarea", label: "多行文本" },
  { type: "number", label: "数字" },
  { type: "radio", label: "单选" },
  { type: "checkbox_group", label: "多选组" },
  { type: "select", label: "下拉选择" },
  { type: "rating", label: "评分" },
  { type: "json", label: "JSON" },
  { type: "llm_trigger", label: "LLM 触发器" },
];

const emptySchema: TemplateSchemaDocument = {
  version: 1,
  title: "未命名模板",
  layout: { type: "single", groups: [] },
  fields: [],
  llmTools: [],
  validations: [],
  visibilityRules: [],
};

export function TemplateDesigner({ initialSchema, onChange }: TemplateDesignerProps) {
  const [schema, setSchema] = useState<TemplateSchemaDocument>(initialSchema ?? emptySchema);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(schema.fields[0]?.id ?? null);
  const [mode, setMode] = useState<"design" | "preview">("design");
  const selectedField = useMemo(
    () => schema.fields.find((field) => field.id === selectedFieldId) ?? null,
    [schema.fields, selectedFieldId],
  );

  useEffect(() => {
    if (!initialSchema) {
      return;
    }
    setSchema(initialSchema);
    setSelectedFieldId(initialSchema.fields[0]?.id ?? null);
  }, [initialSchema]);

  function commit(nextSchema: TemplateSchemaDocument) {
    setSchema(nextSchema);
    onChange?.(nextSchema);
  }

  function addField(type: TemplateFieldType) {
    const nextField = createField(type, schema.fields);
    const nextSchema = { ...schema, fields: [...schema.fields, nextField] };
    setSelectedFieldId(nextField.id);
    commit(nextSchema);
  }

  function renameSelected(label: string) {
    if (!selectedField) {
      return;
    }
    commit({
      ...schema,
      fields: schema.fields.map((field) =>
        field.id === selectedField.id ? { ...field, label } : field,
      ),
    });
  }

  return (
    <section className="template-designer" aria-label="模板设计器">
      <div className="designer-toolbar">
        <Typography.Title level={3}>模板设计器</Typography.Title>
        <Segmented
          value={mode}
          onChange={(value) => setMode(value as "design" | "preview")}
          options={[
            { label: "设计", value: "design" },
            { label: "预览", value: "preview" },
          ]}
        />
      </div>

      {mode === "preview" ? (
        <SchemaRenderer
          schema={schema}
          item={{ payload: { text: "预览数据项文本" } }}
          readOnly
        />
      ) : (
        <div className="designer-grid">
          <aside className="designer-panel" aria-label="组件面板">
            <Typography.Title level={4}>组件面板</Typography.Title>
            <div className="palette-buttons">
              {palette.map((item) => (
                <Button key={item.type} onClick={() => addField(item.type)}>
                  添加{item.label}字段
                </Button>
              ))}
            </div>
          </aside>

          <main className="designer-canvas" aria-label="字段画布">
            <Typography.Title level={4}>字段</Typography.Title>
            {schema.fields.length === 0 ? (
              <Typography.Text type="secondary">暂无字段</Typography.Text>
            ) : (
              <div className="field-list">
                {schema.fields.map((field) => (
                  <button
                    className={field.id === selectedFieldId ? "field-row active" : "field-row"}
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    type="button"
                  >
                    <span>{field.label}</span>
                    <code>{field.id}</code>
                  </button>
                ))}
              </div>
            )}
          </main>

          <aside className="designer-panel" aria-label="属性检查器">
            <Typography.Title level={4}>属性</Typography.Title>
            {selectedField ? (
              <label className="schema-control">
                <span>标签</span>
                <Input
                  value={selectedField.label}
                  onChange={(event) => renameSelected(event.target.value)}
                />
              </label>
            ) : (
              <Typography.Text type="secondary">请选择一个字段</Typography.Text>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function createField(type: TemplateFieldType, fields: TemplateField[]): TemplateField {
  const nextIndex = fields.filter((field) => field.type === type).length + 1;
  const base = {
    id: `${type === "checkbox_group" ? "checkbox" : type}_${nextIndex}`,
    label: defaultLabel(type),
    required: false,
  };

  switch (type) {
    case "show_item":
      return { ...base, id: `raw_text_${nextIndex}`, type, label: "原始文本", source: "item.payload.text" };
    case "radio":
      return { ...base, type, label: "单选字段", options: defaultOptions() };
    case "checkbox_group":
      return { ...base, type, label: "多选组字段", options: defaultOptions() };
    case "select":
      return { ...base, type, label: "下拉选择字段", options: defaultOptions() };
    case "rating":
      return { ...base, type, label: "评分字段", min: 1, max: 5 };
    case "llm_trigger":
      return {
        ...base,
        type,
        label: "LLM 触发器字段",
        promptTemplate: "请辅助标注此数据项：{{item.payload.text}}",
        targetFieldId: fields[0]?.id ?? "summary",
      };
    default:
      return { ...base, type, label: defaultLabel(type) } as TemplateField;
  }
}

function defaultLabel(type: TemplateFieldType): string {
  if (type === "text") {
    return "单行文本字段";
  }
  if (type === "textarea") {
    return "多行文本字段";
  }
  if (type === "number") {
    return "数字字段";
  }
  if (type === "json") {
    return "JSON 字段";
  }
  return `${type} 字段`;
}

function defaultOptions() {
  return [
    { label: "选项 A", value: "option_a" },
    { label: "选项 B", value: "option_b" },
  ];
}
