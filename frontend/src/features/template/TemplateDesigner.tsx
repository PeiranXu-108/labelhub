import { Button, Input, Segmented, Typography } from "antd";
import { useMemo, useState } from "react";

import { SchemaRenderer } from "../schema-renderer";
import type { TemplateField, TemplateFieldType, TemplateSchemaDocument } from "../schema-renderer";

export type TemplateDesignerProps = {
  initialSchema?: TemplateSchemaDocument;
  onChange?: (schema: TemplateSchemaDocument) => void;
};

const palette: Array<{ type: TemplateFieldType; label: string }> = [
  { type: "show_item", label: "Show item" },
  { type: "text", label: "Text" },
  { type: "textarea", label: "Textarea" },
  { type: "number", label: "Number" },
  { type: "radio", label: "Radio" },
  { type: "checkbox_group", label: "Checkbox group" },
  { type: "select", label: "Select" },
  { type: "rating", label: "Rating" },
  { type: "json", label: "JSON" },
  { type: "llm_trigger", label: "LLM trigger" },
];

const emptySchema: TemplateSchemaDocument = {
  version: 1,
  title: "Untitled template",
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
    <section className="template-designer" aria-label="Template designer">
      <div className="designer-toolbar">
        <Typography.Title level={3}>Template designer</Typography.Title>
        <Segmented
          value={mode}
          onChange={(value) => setMode(value as "design" | "preview")}
          options={[
            { label: "Design", value: "design" },
            { label: "Preview", value: "preview" },
          ]}
        />
      </div>

      {mode === "preview" ? (
        <SchemaRenderer
          schema={schema}
          item={{ payload: { text: "Preview item text" } }}
          readOnly
        />
      ) : (
        <div className="designer-grid">
          <aside className="designer-panel" aria-label="Component palette">
            <Typography.Title level={4}>Palette</Typography.Title>
            <div className="palette-buttons">
              {palette.map((item) => (
                <Button key={item.type} onClick={() => addField(item.type)}>
                  Add {item.label.toLowerCase()} field
                </Button>
              ))}
            </div>
          </aside>

          <main className="designer-canvas" aria-label="Field canvas">
            <Typography.Title level={4}>Fields</Typography.Title>
            {schema.fields.length === 0 ? (
              <Typography.Text type="secondary">No fields yet</Typography.Text>
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

          <aside className="designer-panel" aria-label="Property inspector">
            <Typography.Title level={4}>Inspector</Typography.Title>
            {selectedField ? (
              <label className="schema-control">
                <span>Label</span>
                <Input
                  value={selectedField.label}
                  onChange={(event) => renameSelected(event.target.value)}
                />
              </label>
            ) : (
              <Typography.Text type="secondary">Select a field</Typography.Text>
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
      return { ...base, id: `raw_text_${nextIndex}`, type, label: "Raw text", source: "item.payload.text" };
    case "radio":
      return { ...base, type, label: "Radio field", options: defaultOptions() };
    case "checkbox_group":
      return { ...base, type, label: "Checkbox group field", options: defaultOptions() };
    case "select":
      return { ...base, type, label: "Select field", options: defaultOptions() };
    case "rating":
      return { ...base, type, label: "Rating field", min: 1, max: 5 };
    case "llm_trigger":
      return {
        ...base,
        type,
        label: "LLM trigger field",
        promptTemplate: "Help label this item: {{item.payload.text}}",
        targetFieldId: fields[0]?.id ?? "summary",
      };
    default:
      return { ...base, type, label: defaultLabel(type) } as TemplateField;
  }
}

function defaultLabel(type: TemplateFieldType): string {
  if (type === "text") {
    return "Text field";
  }
  if (type === "textarea") {
    return "Textarea field";
  }
  if (type === "number") {
    return "Number field";
  }
  if (type === "json") {
    return "JSON field";
  }
  return `${type} field`;
}

function defaultOptions() {
  return [
    { label: "Option A", value: "option_a" },
    { label: "Option B", value: "option_b" },
  ];
}
