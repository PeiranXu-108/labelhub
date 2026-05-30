import { Segmented } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { TemplateField, TemplateFieldType, TemplateSchemaDocument } from "../schema-renderer";
import { TemplateDesignerCanvas } from "./TemplateDesignerCanvas";
import { TemplateDesignerPreview } from "./TemplateDesignerPreview";
import { TemplateFieldPalette } from "./TemplateFieldPalette";
import { TemplatePropertyInspector } from "./TemplatePropertyInspector";
import {
  createField,
  duplicateField,
  moveField,
  validateTemplateSchema,
} from "./templateDesignerModel";

export { validateTemplateSchema } from "./templateDesignerModel";

export type TemplateDesignerProps = {
  initialSchema?: TemplateSchemaDocument;
  onChange?: (schema: TemplateSchemaDocument) => void;
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

export function TemplateDesigner({ initialSchema, onChange }: TemplateDesignerProps) {
  const [schema, setSchema] = useState<TemplateSchemaDocument>(initialSchema ?? emptySchema);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    schema.fields.length > 0 ? 0 : null,
  );
  const [mode, setMode] = useState<"design" | "preview">("design");
  const validationIssues = useMemo(() => validateTemplateSchema(schema), [schema]);
  const selectedField = selectedIndex == null ? null : schema.fields[selectedIndex] ?? null;

  useEffect(() => {
    if (!initialSchema) {
      return;
    }
    setSchema(initialSchema);
    setSelectedIndex((current) => {
      if (current != null && initialSchema.fields[current]) {
        return current;
      }
      return initialSchema.fields.length > 0 ? 0 : null;
    });
  }, [initialSchema]);

  function commit(nextSchema: TemplateSchemaDocument) {
    setSchema(nextSchema);
    onChange?.(nextSchema);
  }

  function addField(type: TemplateFieldType, index = schema.fields.length) {
    const nextField = createField(type, schema.fields);
    const insertIndex = Math.max(0, Math.min(index, schema.fields.length));
    const nextFields = [...schema.fields];
    nextFields.splice(insertIndex, 0, nextField);
    setSelectedIndex(insertIndex);
    commit({ ...schema, fields: nextFields });
  }

  function updateSelectedField(updater: (field: TemplateField) => TemplateField) {
    if (selectedIndex == null || !schema.fields[selectedIndex]) {
      return;
    }
    const currentField = schema.fields[selectedIndex];
    const nextField = updater(currentField);
    const nextFields = schema.fields.map((field, index) =>
      index === selectedIndex ? nextField : updateFieldReferences(field, currentField.id, nextField.id),
    );
    commit({
      ...schema,
      fields: nextFields,
      llmTools: schema.llmTools.map((tool) =>
        tool.targetFieldId === currentField.id ? { ...tool, targetFieldId: nextField.id } : tool,
      ),
    });
  }

  function moveFieldByIndex(fromIndex: number, toIndex: number) {
    const clampedToIndex = Math.max(0, Math.min(toIndex, schema.fields.length - 1));
    const nextFields = moveField(schema.fields, fromIndex, clampedToIndex);
    if (nextFields === schema.fields) {
      return;
    }
    setSelectedIndex((current) => nextSelectedIndexAfterMove(current, fromIndex, clampedToIndex));
    commit({ ...schema, fields: nextFields });
  }

  function duplicateFieldByIndex(index: number) {
    const field = schema.fields[index];
    if (!field) {
      return;
    }
    const nextField = duplicateField(field, schema.fields);
    const nextFields = [...schema.fields];
    nextFields.splice(index + 1, 0, nextField);
    setSelectedIndex(index + 1);
    commit({ ...schema, fields: nextFields });
  }

  function deleteFieldByIndex(index: number) {
    if (!schema.fields[index]) {
      return;
    }
    const nextFields = schema.fields.filter((_, fieldIndex) => fieldIndex !== index);
    setSelectedIndex(nextFields.length === 0 ? null : Math.min(index, nextFields.length - 1));
    commit({ ...schema, fields: nextFields });
  }

  return (
    <section className="template-designer" aria-label="模板设计器">
      <div className="designer-toolbar">
        <h3>模板设计器</h3>
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
        <TemplateDesignerPreview schema={schema} />
      ) : (
        <>
          {validationIssues.length > 0 ? (
            <div className="template-validation" role="alert">
              {validationIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          ) : null}
          <div className="designer-grid">
            <TemplateFieldPalette onAddField={(type) => addField(type)} />
            <TemplateDesignerCanvas
              fields={schema.fields}
              selectedIndex={selectedIndex}
              onAddField={addField}
              onDeleteField={deleteFieldByIndex}
              onDuplicateField={duplicateFieldByIndex}
              onMoveField={moveFieldByIndex}
              onSelectField={setSelectedIndex}
            />
            <TemplatePropertyInspector
              field={selectedField}
              fields={schema.fields}
              issues={validationIssues}
              onDelete={() => selectedIndex != null && deleteFieldByIndex(selectedIndex)}
              onDuplicate={() => selectedIndex != null && duplicateFieldByIndex(selectedIndex)}
              onUpdate={updateSelectedField}
            />
          </div>
        </>
      )}
    </section>
  );
}

function updateFieldReferences(field: TemplateField, previousId: string, nextId: string): TemplateField {
  if (field.type === "llm_trigger" && field.targetFieldId === previousId) {
    return { ...field, targetFieldId: nextId };
  }
  return field;
}

function nextSelectedIndexAfterMove(
  selectedIndex: number | null,
  fromIndex: number,
  toIndex: number,
): number | null {
  if (selectedIndex == null) {
    return null;
  }
  if (selectedIndex === fromIndex) {
    return toIndex;
  }
  if (fromIndex < selectedIndex && toIndex >= selectedIndex) {
    return selectedIndex - 1;
  }
  if (fromIndex > selectedIndex && toIndex <= selectedIndex) {
    return selectedIndex + 1;
  }
  return selectedIndex;
}
