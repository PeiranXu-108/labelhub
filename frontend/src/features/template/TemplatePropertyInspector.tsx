import { Checkbox, Input, InputNumber, Select, Typography } from "antd";

import type { TemplateField, TemplateOption } from "../schema-renderer";
import {
  emptyToNull,
  isLlmTriggerField,
  isNumberField,
  isOptionField,
  isRatingField,
  isShowItemField,
  isTextField,
} from "./templateDesignerModel";

type TemplatePropertyInspectorProps = {
  field: TemplateField | null;
  fields: TemplateField[];
  issues: string[];
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdate: (updater: (field: TemplateField) => TemplateField) => void;
};

export function TemplatePropertyInspector({
  field,
  fields,
  issues: _issues,
  onDelete,
  onDuplicate,
  onUpdate,
}: TemplatePropertyInspectorProps) {
  return (
    <aside className="designer-panel inspector-panel" aria-label="属性检查器">
      <h4 className="designer-panel-title">属性</h4>
      {!field ? (
        <Typography.Text type="secondary">请选择一个字段</Typography.Text>
      ) : (
        <div className="inspector-form">
          <div className="inspector-actions">
            <button aria-label="复制当前字段" onClick={onDuplicate} type="button">
              复制
            </button>
            <button aria-label="删除当前字段" onClick={onDelete} type="button">
              删除
            </button>
          </div>
          <CommonFieldEditor field={field} onUpdate={onUpdate} />
          {renderSpecificEditor(field, fields, onUpdate)}
          <LayoutEditor />
        </div>
      )}
    </aside>
  );
}

type FieldEditorProps = {
  field: TemplateField;
  onUpdate: (updater: (field: TemplateField) => TemplateField) => void;
};

function CommonFieldEditor({ field, onUpdate }: FieldEditorProps) {
  const canRequire = field.type !== "show_item" && field.type !== "llm_trigger";

  return (
    <>
      <label className="schema-control">
        <span>字段 ID</span>
        <Input
          value={field.id}
          onChange={(event) =>
            onUpdate((current) => ({ ...current, id: event.target.value } as TemplateField))
          }
        />
      </label>
      <label className="schema-control">
        <span>字段标签</span>
        <Input
          value={field.label}
          onChange={(event) =>
            onUpdate((current) => ({ ...current, label: event.target.value } as TemplateField))
          }
        />
      </label>
      <label className="schema-control">
        <span>帮助文本</span>
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 4 }}
          value={field.helpText ?? ""}
          onChange={(event) =>
            onUpdate((current) => ({ ...current, helpText: emptyToNull(event.target.value) } as TemplateField))
          }
        />
      </label>
      <Checkbox
        checked={canRequire ? Boolean(field.required) : false}
        disabled={!canRequire}
        onChange={(event) =>
          onUpdate((current) => ({ ...current, required: event.target.checked } as TemplateField))
        }
      >
        必填
      </Checkbox>
    </>
  );
}

function renderSpecificEditor(
  field: TemplateField,
  fields: TemplateField[],
  onUpdate: (updater: (field: TemplateField) => TemplateField) => void,
) {
  if (isShowItemField(field)) {
    return (
      <label className="schema-control">
        <span>数据源路径</span>
        <Input
          value={field.source}
          onChange={(event) =>
            onUpdate((current) =>
              isShowItemField(current) ? { ...current, source: event.target.value } : current,
            )
          }
        />
      </label>
    );
  }

  if (isTextField(field)) {
    return (
      <>
        <label className="schema-control">
          <span>占位提示</span>
          <Input
            value={field.placeholder ?? ""}
            onChange={(event) =>
              onUpdate((current) =>
                isTextField(current)
                  ? { ...current, placeholder: emptyToNull(event.target.value) }
                  : current,
              )
            }
          />
        </label>
        <div className="inspector-grid">
          <label className="schema-control">
            <span>最小长度</span>
            <InputNumber
              aria-label="最小长度"
              min={0}
              value={field.minLength ?? null}
              onChange={(value) =>
                onUpdate((current) =>
                  isTextField(current) ? { ...current, minLength: numberOrNull(value) } : current,
                )
              }
            />
          </label>
          <label className="schema-control">
            <span>最大长度</span>
            <InputNumber
              aria-label="最大长度"
              min={1}
              value={field.maxLength ?? null}
              onChange={(value) =>
                onUpdate((current) =>
                  isTextField(current) ? { ...current, maxLength: numberOrNull(value) } : current,
                )
              }
            />
          </label>
        </div>
      </>
    );
  }

  if (isNumberField(field)) {
    return (
      <div className="inspector-grid">
        <label className="schema-control">
          <span>最小值</span>
          <InputNumber
            aria-label="最小值"
            value={field.min ?? null}
            onChange={(value) =>
              onUpdate((current) =>
                isNumberField(current) ? { ...current, min: numberOrNull(value) } : current,
              )
            }
          />
        </label>
        <label className="schema-control">
          <span>最大值</span>
          <InputNumber
            aria-label="最大值"
            value={field.max ?? null}
            onChange={(value) =>
              onUpdate((current) =>
                isNumberField(current) ? { ...current, max: numberOrNull(value) } : current,
              )
            }
          />
        </label>
      </div>
    );
  }

  if (isOptionField(field)) {
    return <OptionEditor field={field} onUpdate={onUpdate} />;
  }

  if (isRatingField(field)) {
    return (
      <div className="inspector-grid">
        <label className="schema-control">
          <span>评分最小值</span>
          <InputNumber
            aria-label="评分最小值"
            min={0}
            value={field.min ?? 1}
            onChange={(value) =>
              onUpdate((current) =>
                isRatingField(current) ? { ...current, min: numberOrNull(value) ?? 1 } : current,
              )
            }
          />
        </label>
        <label className="schema-control">
          <span>评分最大值</span>
          <InputNumber
            aria-label="评分最大值"
            min={1}
            value={field.max ?? 5}
            onChange={(value) =>
              onUpdate((current) =>
                isRatingField(current) ? { ...current, max: numberOrNull(value) ?? 5 } : current,
              )
            }
          />
        </label>
      </div>
    );
  }

  if (isLlmTriggerField(field)) {
    const targetOptions = fields
      .filter((candidate) => candidate.type !== "llm_trigger")
      .map((candidate) => ({ label: `${candidate.label} (${candidate.id})`, value: candidate.id }));
    return (
      <>
        <label className="schema-control">
          <span>Prompt 模板</span>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 8 }}
            value={field.promptTemplate}
            onChange={(event) =>
              onUpdate((current) =>
                isLlmTriggerField(current)
                  ? { ...current, promptTemplate: event.target.value }
                  : current,
              )
            }
          />
        </label>
        <label className="schema-control">
          <span>目标字段</span>
          <Select
            aria-label="目标字段"
            options={targetOptions}
            value={field.targetFieldId}
            onChange={(value) =>
              onUpdate((current) =>
                isLlmTriggerField(current) ? { ...current, targetFieldId: value } : current,
              )
            }
          />
        </label>
      </>
    );
  }

  return null;
}

function OptionEditor({
  field,
  onUpdate,
}: {
  field: Extract<TemplateField, { options: TemplateOption[] }>;
  onUpdate: (updater: (field: TemplateField) => TemplateField) => void;
}) {
  function updateOption(index: number, patch: Partial<TemplateOption>) {
    onUpdate((current) =>
      isOptionField(current)
        ? {
            ...current,
            options: current.options.map((option, optionIndex) =>
              optionIndex === index ? { ...option, ...patch } : option,
            ),
          }
        : current,
    );
  }

  function addOption() {
    onUpdate((current) =>
      isOptionField(current)
        ? {
            ...current,
            options: [
              ...current.options,
              { label: `选项 ${current.options.length + 1}`, value: `option_${current.options.length + 1}` },
            ],
          }
        : current,
    );
  }

  function deleteOption(index: number) {
    onUpdate((current) =>
      isOptionField(current)
        ? { ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }
        : current,
    );
  }

  return (
    <div className="option-editor">
      {field.options.map((option, index) => (
        <div className="option-row" key={`${option.value}-${index}`}>
          <label className="schema-control">
            <span>{`选项 ${index + 1} 标签`}</span>
            <Input
              aria-label={`选项 ${index + 1} 标签`}
              value={option.label}
              onChange={(event) => updateOption(index, { label: event.target.value })}
            />
          </label>
          <label className="schema-control">
            <span>{`选项 ${index + 1} 值`}</span>
            <Input
              aria-label={`选项 ${index + 1} 值`}
              value={option.value}
              onChange={(event) => updateOption(index, { value: event.target.value })}
            />
          </label>
          <button aria-label={`删除选项 ${index + 1}`} onClick={() => deleteOption(index)} type="button">
            删除
          </button>
        </div>
      ))}
      <button onClick={addOption} type="button">
        新增选项
      </button>
    </div>
  );
}

function LayoutEditor() {
  return (
    <div className="layout-disabled" aria-label="布局设置">
      <Typography.Text strong>布局</Typography.Text>
      <Select
        aria-label="布局分组"
        disabled
        options={[{ label: "单列布局，分组与条件由 Task 15 接入", value: "single" }]}
        value="single"
      />
    </div>
  );
}

function numberOrNull(value: string | number | null): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  return null;
}
