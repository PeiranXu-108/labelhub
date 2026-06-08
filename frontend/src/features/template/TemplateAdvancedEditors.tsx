import { Button, Checkbox, Input, InputNumber, Radio, Select, Space, Typography } from "antd";

import type {
  AnswerValidation,
  LayoutGroup,
  TemplateField,
  TemplateLayout,
  TemplateSchemaDocument,
  VisibilityRule,
} from "../schema-renderer";
import {
  answerableFields,
  compareOperatorOptions,
  createLayoutGroup,
  createValidationRule,
  createVisibilityRule,
  supportedCustomValidatorOptions,
  visibilityOperatorOptions,
} from "./templateDesignerModel";

type SchemaEditorProps = {
  field: TemplateField;
  schema: TemplateSchemaDocument;
  onSchemaChange: (schema: TemplateSchemaDocument) => void;
};

export function ValidationRuleEditor({ field, schema, onSchemaChange }: SchemaEditorProps) {
  const fieldValidations = schema.validations
    .map((validation, index) => ({ validation, index }))
    .filter(({ validation }) => validation.fieldId === field.id);
  const canAddCompare = answerableFields(schema.fields).some((candidate) => candidate.id !== field.id);

  function addValidation(type: AnswerValidation["type"]) {
    const validation = createValidationRule(type, field.id, schema.fields);
    if (!validation) {
      return;
    }
    onSchemaChange({ ...schema, validations: [...schema.validations, validation] });
  }

  function updateValidation(index: number, validation: AnswerValidation) {
    onSchemaChange({
      ...schema,
      validations: schema.validations.map((current, validationIndex) =>
        validationIndex === index ? validation : current,
      ),
    });
  }

  function deleteValidation(index: number) {
    onSchemaChange({
      ...schema,
      validations: schema.validations.filter((_, validationIndex) => validationIndex !== index),
    });
  }

  if (!answerableFields(schema.fields).some((candidate) => candidate.id === field.id)) {
    return <Typography.Text type="secondary">展示字段和 LLM 触发器不需要答案验证。</Typography.Text>;
  }

  return (
    <div className="advanced-editor">
      <div className="advanced-button-grid" aria-label="新增验证规则">
        <Button size="small" onClick={() => addValidation("required")}>添加必填验证</Button>
        <Button size="small" onClick={() => addValidation("min_length")}>添加长度下限</Button>
        <Button size="small" onClick={() => addValidation("max_length")}>添加长度上限</Button>
        <Button size="small" onClick={() => addValidation("min")}>添加最小值</Button>
        <Button size="small" onClick={() => addValidation("max")}>添加最大值</Button>
        <Button size="small" onClick={() => addValidation("regex")}>添加正则验证</Button>
        <Button size="small" disabled={!canAddCompare} onClick={() => addValidation("compare")}>
          添加跨字段比较
        </Button>
        <Button size="small" onClick={() => addValidation("custom")}>添加自定义验证</Button>
      </div>
      {fieldValidations.length === 0 ? (
        <Typography.Text type="secondary">暂无运行时验证规则。</Typography.Text>
      ) : (
        fieldValidations.map(({ validation, index }) => (
          <div className="advanced-rule-card" key={`${validation.type}-${index}`}>
            <Space className="advanced-rule-header" align="center" wrap>
              <Typography.Text strong>{validationLabel(validation.type)}</Typography.Text>
              <Button size="small" onClick={() => deleteValidation(index)}>删除</Button>
            </Space>
            {renderValidationControls(validation, schema.fields, (nextValidation) =>
              updateValidation(index, nextValidation),
            )}
            <label className="schema-control">
              <span>错误提示</span>
              <Input
                value={validation.message ?? ""}
                onChange={(event) =>
                  updateValidation(index, {
                    ...validation,
                    message: emptyToNull(event.target.value),
                  } as AnswerValidation)
                }
              />
            </label>
          </div>
        ))
      )}
    </div>
  );
}

function renderValidationControls(
  validation: AnswerValidation,
  fields: TemplateField[],
  onChange: (validation: AnswerValidation) => void,
) {
  if (validation.type === "min_length" || validation.type === "max_length") {
    return (
      <label className="schema-control">
        <span>长度限制</span>
        <InputNumber
          aria-label="长度限制"
          min={validation.type === "min_length" ? 0 : 1}
          value={validation.limit}
          onChange={(value) => onChange({ ...validation, limit: numberOr(validation.limit, value) })}
        />
      </label>
    );
  }
  if (validation.type === "min" || validation.type === "max") {
    return (
      <label className="schema-control">
        <span>数值限制</span>
        <InputNumber
          aria-label="数值限制"
          value={validation.value}
          onChange={(value) => onChange({ ...validation, value: numberOr(validation.value, value) })}
        />
      </label>
    );
  }
  if (validation.type === "regex") {
    return (
      <>
        <label className="schema-control">
          <span>正则表达式</span>
          <Input
            aria-label="正则表达式"
            value={validation.pattern}
            onChange={(event) => onChange({ ...validation, pattern: event.target.value })}
          />
        </label>
        <Checkbox
          checked={(validation.flags ?? []).includes("i")}
          onChange={(event) =>
            onChange({ ...validation, flags: event.target.checked ? ["i"] : [] })
          }
        >
          忽略大小写
        </Checkbox>
      </>
    );
  }
  if (validation.type === "compare") {
    const otherFieldOptions = answerableFields(fields)
      .filter((candidate) => candidate.id !== validation.fieldId)
      .map((candidate) => ({ label: `${candidate.label} (${candidate.id})`, value: candidate.id }));
    return (
      <>
        <div className="schema-control">
          <span>比较方式</span>
          <Radio.Group
            options={[...compareOperatorOptions]}
            value={validation.operator}
            onChange={(event) => onChange({ ...validation, operator: event.target.value })}
          />
        </div>
        <label className="schema-control">
          <span>比较字段</span>
          <Select
            aria-label="比较字段"
            options={otherFieldOptions}
            value={validation.otherFieldId}
            onChange={(value) => onChange({ ...validation, otherFieldId: value })}
          />
        </label>
      </>
    );
  }
  if (validation.type === "custom") {
    return (
      <div className="schema-control">
        <span>自定义验证器</span>
        <Radio.Group
          options={[...supportedCustomValidatorOptions]}
          value={validation.name}
          onChange={(event) => onChange({ ...validation, name: event.target.value })}
        />
      </div>
    );
  }
  return null;
}

export function LinkageRuleEditor({ field, schema, onSchemaChange }: SchemaEditorProps) {
  const fieldRules = schema.visibilityRules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.targetFieldId === field.id);
  const canAddRule = answerableFields(schema.fields).some((candidate) => candidate.id !== field.id);

  function addRule() {
    const rule = createVisibilityRule(field.id, schema.fields, schema.visibilityRules);
    if (!rule) {
      return;
    }
    onSchemaChange({ ...schema, visibilityRules: [...schema.visibilityRules, rule] });
  }

  function updateRule(index: number, rule: VisibilityRule) {
    onSchemaChange({
      ...schema,
      visibilityRules: schema.visibilityRules.map((current, ruleIndex) => (ruleIndex === index ? rule : current)),
    });
  }

  function deleteRule(index: number) {
    onSchemaChange({
      ...schema,
      visibilityRules: schema.visibilityRules.filter((_, ruleIndex) => ruleIndex !== index),
    });
  }

  return (
    <div className="advanced-editor">
      <Space className="advanced-rule-header" align="center" wrap>
        <Typography.Text strong>显示规则</Typography.Text>
        <Button size="small" disabled={!canAddRule} onClick={addRule}>添加显示规则</Button>
      </Space>
      {fieldRules.length === 0 ? (
        <Typography.Text type="secondary">当前字段没有显示规则，默认始终显示。</Typography.Text>
      ) : (
        fieldRules.map(({ rule, index }) => (
          <div className="advanced-rule-card" key={`${rule.id ?? rule.targetFieldId}-${index}`}>
            <Space className="advanced-rule-header" align="center" wrap>
              <Typography.Text strong>{rule.id ?? `规则 ${index + 1}`}</Typography.Text>
              <Button size="small" onClick={() => deleteRule(index)}>删除</Button>
            </Space>
            <label className="schema-control">
              <span>规则 ID</span>
              <Input
                aria-label="显示规则 ID"
                value={rule.id ?? ""}
                onChange={(event) => updateRule(index, { ...rule, id: emptyToNull(event.target.value) })}
              />
            </label>
            <label className="schema-control">
              <span>来源字段</span>
              <Select
                aria-label="来源字段"
                options={answerableFields(schema.fields)
                  .filter((candidate) => candidate.id !== field.id)
                  .map((candidate) => ({ label: `${candidate.label} (${candidate.id})`, value: candidate.id }))}
                value={rule.condition.sourceFieldId}
                onChange={(value) =>
                  updateRule(index, {
                    ...rule,
                    condition: { ...rule.condition, sourceFieldId: value },
                  })
                }
              />
            </label>
            <div className="schema-control">
              <span>显示条件</span>
              <Radio.Group
                options={[...visibilityOperatorOptions]}
                value={rule.condition.operator}
                onChange={(event) =>
                  updateRule(index, {
                    ...rule,
                    condition: {
                      ...rule.condition,
                      operator: event.target.value,
                      value: conditionValueForOperator(event.target.value, rule.condition.value),
                    },
                  })
                }
              />
            </div>
            {rule.condition.operator === "is_empty" || rule.condition.operator === "is_not_empty" ? null : (
              <label className="schema-control">
                <span>显示条件值</span>
                <Input
                  aria-label="显示条件值"
                  value={displayConditionValue(rule.condition.value)}
                  onChange={(event) =>
                    updateRule(index, {
                      ...rule,
                      condition: {
                        ...rule.condition,
                        value: parseConditionValue(rule.condition.operator, event.target.value),
                      },
                    })
                  }
                />
              </label>
            )}
          </div>
        ))
      )}
      <LayoutAuthoringEditor field={field} schema={schema} onSchemaChange={onSchemaChange} />
    </div>
  );
}

function LayoutAuthoringEditor({ field, schema, onSchemaChange }: SchemaEditorProps) {
  const groupedFieldIds = new Set(schema.layout.groups.flatMap((group) => group.fieldIds));
  const hasUngroupedFields = schema.fields.some((candidate) => !groupedFieldIds.has(candidate.id));

  function updateLayout(layout: TemplateLayout) {
    onSchemaChange({ ...schema, layout });
  }

  function setLayoutType(type: TemplateLayout["type"]) {
    if (type === "single") {
      updateLayout({ type, groups: [] });
      return;
    }
    const groups = schema.layout.groups.length > 0
      ? schema.layout.groups
      : [createLayoutGroup(schema.layout, schema.fields, field.id)].filter((group): group is LayoutGroup => Boolean(group));
    updateLayout({ type, groups });
  }

  function addGroup() {
    const group = createLayoutGroup(schema.layout, schema.fields, field.id);
    if (!group) {
      return;
    }
    updateLayout({ ...schema.layout, groups: [...schema.layout.groups, group] });
  }

  function updateGroup(index: number, group: LayoutGroup) {
    updateLayout({
      ...schema.layout,
      groups: schema.layout.groups.map((current, groupIndex) => (groupIndex === index ? group : current)),
    });
  }

  function deleteGroup(index: number) {
    const groups = schema.layout.groups.filter((_, groupIndex) => groupIndex !== index);
    updateLayout({
      type: groups.length === 0 ? "single" : schema.layout.type,
      groups: groups.length === 0 ? [] : groups,
    });
  }

  return (
    <div className="layout-editor" aria-label="布局设置">
      <Typography.Text strong>布局</Typography.Text>
      <div className="schema-control">
        <span>布局类型</span>
        <Radio.Group
          value={schema.layout.type}
          onChange={(event) => setLayoutType(event.target.value)}
          options={[
            { label: "单页", value: "single" },
            { label: "分组", value: "group" },
            { label: "标签页", value: "tabs" },
          ]}
        />
      </div>
      {schema.layout.type === "single" ? (
        <Typography.Text type="secondary">单页布局按画布字段顺序渲染。</Typography.Text>
      ) : (
        <>
          {schema.layout.groups.map((group, index) => (
            <div className="advanced-rule-card" key={group.id}>
              <Space className="advanced-rule-header" align="center" wrap>
                <Typography.Text strong>{`布局分组 ${index + 1}`}</Typography.Text>
                <Button size="small" onClick={() => deleteGroup(index)}>删除</Button>
              </Space>
              <label className="schema-control">
                <span>{`布局分组 ${index + 1} ID`}</span>
                <Input
                  aria-label={`布局分组 ${index + 1} ID`}
                  value={group.id}
                  onChange={(event) => updateGroup(index, { ...group, id: event.target.value })}
                />
              </label>
              <label className="schema-control">
                <span>{`布局分组 ${index + 1} 标题`}</span>
                <Input
                  aria-label={`布局分组 ${index + 1} 标题`}
                  value={group.title}
                  onChange={(event) => updateGroup(index, { ...group, title: event.target.value })}
                />
              </label>
              <label className="schema-control">
                <span>{`布局分组 ${index + 1} 描述`}</span>
                <Input.TextArea
                  aria-label={`布局分组 ${index + 1} 描述`}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  value={group.description ?? ""}
                  onChange={(event) => updateGroup(index, { ...group, description: emptyToNull(event.target.value) })}
                />
              </label>
              <div className="schema-control">
                <span>字段分配</span>
                <Checkbox.Group
                  options={schema.fields.map((candidate) => ({
                    label: `${candidate.label} (${candidate.id})`,
                    value: candidate.id,
                  }))}
                  value={group.fieldIds}
                  onChange={(values) => {
                    const fieldIds = values.map(String);
                    if (fieldIds.length > 0) {
                      updateGroup(index, { ...group, fieldIds });
                    }
                  }}
                />
              </div>
            </div>
          ))}
          <Button size="small" disabled={!hasUngroupedFields} onClick={addGroup}>新增布局分组</Button>
          <Typography.Text type="secondary">未分配字段会在运行时保留为未分组区域。</Typography.Text>
        </>
      )}
    </div>
  );
}

function validationLabel(type: AnswerValidation["type"]): string {
  const labels: Record<AnswerValidation["type"], string> = {
    required: "必填",
    min_length: "长度下限",
    max_length: "长度上限",
    min: "最小值",
    max: "最大值",
    regex: "正则",
    compare: "跨字段比较",
    custom: "自定义验证器",
  };
  return labels[type];
}

function numberOr(fallback: number, value: string | number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  return fallback;
}

function emptyToNull(value: string): string | null {
  return value.trim() ? value : null;
}

function conditionValueForOperator(operator: VisibilityRule["condition"]["operator"], value: unknown): unknown {
  if (operator === "is_empty" || operator === "is_not_empty") {
    return undefined;
  }
  if ((operator === "in" || operator === "not_in") && !Array.isArray(value)) {
    return [];
  }
  if (operator !== "in" && operator !== "not_in" && Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function displayConditionValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(",");
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

function parseConditionValue(operator: VisibilityRule["condition"]["operator"], value: string): unknown {
  if (operator === "in" || operator === "not_in") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return value;
}
