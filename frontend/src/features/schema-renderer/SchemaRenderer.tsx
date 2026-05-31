import { Alert, Button, Checkbox, Input, InputNumber, Radio, Rate, Select, Space, Tabs, Typography } from "antd";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { fetchWithAuth, readError } from "../auth/http";
import type {
  AnswerValidation,
  AnswerPayload,
  FileUploadField,
  ImageUploadField,
  LayoutGroup,
  OptionField,
  RendererItem,
  RichTextField,
  TemplateField,
  TemplateSchemaDocument,
  UploadAssetAnswer,
} from "./types";

const MAX_REGEX_PATTERN_LENGTH = 256;
const MAX_REGEX_REPEAT_BOUND = 100;
const safeRegexLiteralEscapes = new Set([".", "^", "$", "*", "+", "?", "{", "}", "[", "]", "\\", "|", "(", ")", "-"]);
const safeRegexShorthandEscapes = new Set(["d", "D", "s", "S", "w", "W"]);

export type SchemaRendererProps = {
  schema: TemplateSchemaDocument;
  item: RendererItem;
  initialAnswers?: AnswerPayload;
  readOnly?: boolean;
  uploadContext?: {
    assignmentId: string;
  };
  onChange?: (answers: AnswerPayload) => void;
  onSubmit?: (answers: AnswerPayload) => void;
};

function resolveItemPath(item: RendererItem, source: string): unknown {
  if (!source.startsWith("item.payload.")) {
    return undefined;
  }
  return source
    .slice("item.payload.".length)
    .split(".")
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === "object" && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, item.payload);
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return true;
  }
  if (isRichTextAnswer(value)) {
    return !value.content.trim();
  }
  return false;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function plainTextFromMarkdown(markdown: string) {
  return markdown
    .replace(/[*_`>#\-[\]()!]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function richTextAnswer(content: string) {
  return {
    format: "markdown",
    content,
    plainText: plainTextFromMarkdown(content),
  };
}

function isRichTextAnswer(value: unknown): value is { format: "markdown"; content: string; plainText?: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { format?: unknown }).format === "markdown" &&
      typeof (value as { content?: unknown }).content === "string",
  );
}

function uploadAssets(value: unknown): UploadAssetAnswer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isUploadAssetAnswer);
}

function isUploadAssetAnswer(value: unknown): value is UploadAssetAnswer {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as UploadAssetAnswer).assetId === "string" &&
      typeof (value as UploadAssetAnswer).filename === "string" &&
      typeof (value as UploadAssetAnswer).contentType === "string" &&
      typeof (value as UploadAssetAnswer).sizeBytes === "number" &&
      typeof (value as UploadAssetAnswer).downloadUrl === "string",
  );
}

function isAnswerableField(field: TemplateField): boolean {
  return field.type !== "show_item" && field.type !== "llm_trigger";
}

export function getVisibleFieldIds(schema: TemplateSchemaDocument, answers: AnswerPayload): Set<string> {
  const allFieldIds = new Set(schema.fields.map((field) => field.id));
  let visibleFieldIds = new Set(allFieldIds);
  const rulesByTarget = new Map<string, NonNullable<TemplateSchemaDocument["visibilityRules"]>>();
  (schema.visibilityRules ?? []).forEach((rule) => {
    const rules = rulesByTarget.get(rule.targetFieldId) ?? [];
    rules.push(rule);
    rulesByTarget.set(rule.targetFieldId, rules);
  });
  for (let index = 0; index <= rulesByTarget.size; index += 1) {
    const nextVisibleFieldIds = new Set(allFieldIds);
    rulesByTarget.forEach((rules, targetFieldId) => {
      const shouldShow = rules.some((rule) => evaluateVisibilityCondition(rule.condition, answers, visibleFieldIds));
      if (!shouldShow) {
        nextVisibleFieldIds.delete(targetFieldId);
      }
    });
    if (setsEqual(nextVisibleFieldIds, visibleFieldIds)) {
      return nextVisibleFieldIds;
    }
    visibleFieldIds = nextVisibleFieldIds;
  }
  return visibleFieldIds;
}

function evaluateVisibilityCondition(
  condition: TemplateSchemaDocument["visibilityRules"][number]["condition"],
  answers: AnswerPayload,
  visibleFieldIds: Set<string>,
): boolean {
  if (!visibleFieldIds.has(condition.sourceFieldId)) {
    return false;
  }
  const sourceValue = answers[condition.sourceFieldId];
  switch (condition.operator) {
    case "equals":
      return sourceValue === condition.value;
    case "not_equals":
      return sourceValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(sourceValue);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(sourceValue);
    case "contains":
      if (Array.isArray(sourceValue)) {
        return sourceValue.includes(condition.value);
      }
      if (typeof sourceValue === "string" && typeof condition.value === "string") {
        return sourceValue.includes(condition.value);
      }
      return false;
    case "not_contains":
      if (Array.isArray(sourceValue)) {
        return !sourceValue.includes(condition.value);
      }
      if (typeof sourceValue === "string" && typeof condition.value === "string") {
        return !sourceValue.includes(condition.value);
      }
      return true;
    case "is_empty":
      return isEmpty(sourceValue);
    case "is_not_empty":
      return !isEmpty(sourceValue);
    default:
      return false;
  }
}

function setsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }
  for (const entry of left) {
    if (!right.has(entry)) {
      return false;
    }
  }
  return true;
}

export function validateAnswers(
  schema: TemplateSchemaDocument,
  answers: AnswerPayload,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const visibleFieldIds = getVisibleFieldIds(schema, answers);
  const fieldsById = new Map(schema.fields.map((field) => [field.id, field]));
  schema.fields.forEach((field) => {
    if (!isAnswerableField(field) || !visibleFieldIds.has(field.id)) {
      return;
    }
    if (field.required && isEmpty(answers[field.id])) {
      errors[field.id] = `请填写${field.label}`;
      return;
    }
    validateFieldAnswer(field, answers[field.id], errors);
  });
  (schema.validations ?? []).forEach((validation) => {
    validateRuntimeRule(validation, answers, fieldsById, visibleFieldIds, errors);
  });
  return errors;
}

function validateFieldAnswer(
  field: TemplateField,
  value: unknown,
  errors: Record<string, string>,
) {
  if (isEmpty(value)) {
    return;
  }
  if ((field.type === "text" || field.type === "textarea") && typeof value === "string") {
    if (field.minLength != null && value.length < field.minLength) {
      setFieldError(errors, field.id, `${field.label}至少需要 ${field.minLength} 个字符`);
    }
    if (field.maxLength != null && value.length > field.maxLength) {
      setFieldError(errors, field.id, `${field.label}不能超过 ${field.maxLength} 个字符`);
    }
    return;
  }
  if (field.type === "rich_text") {
    if (!isRichTextAnswer(value)) {
      setFieldError(errors, field.id, `${field.label}必须是富文本`);
      return;
    }
    const answer = richTextAnswer(value.content);
    if (field.minLength != null && answer.plainText.length < field.minLength) {
      setFieldError(errors, field.id, `${field.label}至少需要 ${field.minLength} 个字符`);
    }
    if (field.maxLength != null && answer.plainText.length > field.maxLength) {
      setFieldError(errors, field.id, `${field.label}不能超过 ${field.maxLength} 个字符`);
    }
    return;
  }
  if (field.type === "number") {
    const numberValue = numberForValidation(value);
    if (numberValue == null) {
      setFieldError(errors, field.id, `${field.label}必须是数字`);
      return;
    }
    if (field.min != null && numberValue < field.min) {
      setFieldError(errors, field.id, `${field.label}不能小于 ${field.min}`);
    }
    if (field.max != null && numberValue > field.max) {
      setFieldError(errors, field.id, `${field.label}不能大于 ${field.max}`);
    }
    return;
  }
  if (field.type === "rating") {
    const numberValue = numberForValidation(value);
    if (numberValue == null) {
      setFieldError(errors, field.id, `${field.label}必须是评分`);
      return;
    }
    if (numberValue < (field.min ?? 1) || numberValue > (field.max ?? 5)) {
      setFieldError(errors, field.id, `${field.label}必须在 ${field.min ?? 1} 到 ${field.max ?? 5} 之间`);
    }
    return;
  }
  if (field.type === "radio" || field.type === "select") {
    const allowedValues = new Set(field.options.map((option) => option.value));
    if (!allowedValues.has(value as string)) {
      setFieldError(errors, field.id, `${field.label}选项无效`);
    }
    return;
  }
  if (field.type === "checkbox_group") {
    const allowedValues = new Set(field.options.map((option) => option.value));
    if (!Array.isArray(value) || value.some((entry) => !allowedValues.has(entry))) {
      setFieldError(errors, field.id, `${field.label}选项无效`);
    }
    return;
  }
  if (field.type === "json") {
    if (typeof value !== "object" || value === null) {
      setFieldError(errors, field.id, `${field.label}必须是 JSON 对象或数组`);
    }
    return;
  }
  if (field.type === "image_upload" || field.type === "file_upload") {
    if (!Array.isArray(value)) {
      setFieldError(errors, field.id, `${field.label}必须是上传文件列表`);
      return;
    }
    const assets = uploadAssets(value);
    if (assets.length !== value.length) {
      setFieldError(errors, field.id, `${field.label}包含无效上传文件`);
    }
    if (assets.length > field.maxCount) {
      setFieldError(errors, field.id, `${field.label}最多上传 ${field.maxCount} 个文件`);
    }
  }
}

function validateRuntimeRule(
  validation: AnswerValidation,
  answers: AnswerPayload,
  fieldsById: Map<string, TemplateField>,
  visibleFieldIds: Set<string>,
  errors: Record<string, string>,
) {
  const field = fieldsById.get(validation.fieldId);
  if (!field || !visibleFieldIds.has(validation.fieldId)) {
    return;
  }
  const value = answers[validation.fieldId];
  if (validation.type === "required") {
    if (isEmpty(value)) {
      setFieldError(errors, validation.fieldId, validation.message ?? `请填写${field.label}`);
    }
    return;
  }
  if (isEmpty(value)) {
    return;
  }
  if (validation.type === "min_length" || validation.type === "max_length") {
    const textValue = textForValidation(value);
    if (textValue == null) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}必须是文本`);
      return;
    }
    if (validation.type === "min_length" && textValue.length < validation.limit) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}至少需要 ${validation.limit} 个字符`);
    }
    if (validation.type === "max_length" && textValue.length > validation.limit) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}不能超过 ${validation.limit} 个字符`);
    }
    return;
  }
  if (validation.type === "min" || validation.type === "max") {
    const numberValue = numberForValidation(value);
    if (numberValue == null) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}必须是数字`);
      return;
    }
    if (validation.type === "min" && numberValue < validation.value) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}不能小于 ${validation.value}`);
    }
    if (validation.type === "max" && numberValue > validation.value) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}不能大于 ${validation.value}`);
    }
    return;
  }
  if (validation.type === "regex") {
    const textValue = textForValidation(value);
    if (textValue == null) {
      setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}必须是文本`);
      return;
    }
    if (regexPatternSafetyIssue(validation.pattern)) {
      setFieldError(errors, validation.fieldId, `${field.label}正则配置无效`);
      return;
    }
    try {
      const flags = validation.flags?.includes("i") ? "i" : "";
      if (!new RegExp(validation.pattern, flags).test(textValue)) {
        setFieldError(errors, validation.fieldId, validation.message ?? `${field.label}格式无效`);
      }
    } catch {
      setFieldError(errors, validation.fieldId, `${field.label}正则配置无效`);
    }
    return;
  }
  if (validation.type === "compare") {
    const otherField = fieldsById.get(validation.otherFieldId);
    if (!otherField || !visibleFieldIds.has(validation.otherFieldId)) {
      return;
    }
    const otherValue = answers[validation.otherFieldId];
    if (isEmpty(value) || isEmpty(otherValue)) {
      return;
    }
    const issue = compareValues(validation.operator, field.label, otherField.label, value, otherValue);
    if (issue) {
      setFieldError(errors, validation.fieldId, validation.message ?? issue);
    }
    return;
  }
  if (validation.type === "custom") {
    const issue = validateCustom(validation.name, field.label, value);
    if (issue) {
      setFieldError(errors, validation.fieldId, validation.message ?? issue);
    }
  }
}

function compareValues(
  operator: Extract<AnswerValidation, { type: "compare" }>["operator"],
  fieldLabel: string,
  otherFieldLabel: string,
  value: unknown,
  otherValue: unknown,
): string | null {
  if (operator === "equals") {
    return value === otherValue ? null : `${fieldLabel}必须等于${otherFieldLabel}`;
  }
  if (operator === "not_equals") {
    return value !== otherValue ? null : `${fieldLabel}不能等于${otherFieldLabel}`;
  }
  const numberValue = numberForValidation(value);
  const otherNumberValue = numberForValidation(otherValue);
  if (numberValue == null || otherNumberValue == null) {
    return `${fieldLabel}和${otherFieldLabel}必须都是数字`;
  }
  if (operator === "greater_than" && numberValue <= otherNumberValue) {
    return `${fieldLabel}必须大于${otherFieldLabel}`;
  }
  if (operator === "greater_than_or_equal" && numberValue < otherNumberValue) {
    return `${fieldLabel}必须大于等于${otherFieldLabel}`;
  }
  if (operator === "less_than" && numberValue >= otherNumberValue) {
    return `${fieldLabel}必须小于${otherFieldLabel}`;
  }
  if (operator === "less_than_or_equal" && numberValue > otherNumberValue) {
    return `${fieldLabel}必须小于等于${otherFieldLabel}`;
  }
  return null;
}

function validateCustom(
  name: Extract<AnswerValidation, { type: "custom" }>["name"],
  fieldLabel: string,
  value: unknown,
): string | null {
  if (name === "no_whitespace_edges") {
    if (typeof value !== "string") {
      return `${fieldLabel}必须是文本`;
    }
    return value === value.trim() ? null : `${fieldLabel}不能包含首尾空白`;
  }
  if (name === "non_empty_json_object") {
    return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0
      ? null
      : `${fieldLabel}必须是非空 JSON 对象`;
  }
  if (name === "https_url") {
    if (typeof value !== "string") {
      return `${fieldLabel}必须是文本`;
    }
    try {
      const url = new URL(value);
      return url.protocol === "https:" && Boolean(url.hostname) ? null : `${fieldLabel}必须是 HTTPS URL`;
    } catch {
      return `${fieldLabel}必须是 HTTPS URL`;
    }
  }
  return `${fieldLabel}使用了不支持的验证器`;
}

function textForValidation(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (isRichTextAnswer(value)) {
    return richTextAnswer(value.content).plainText;
  }
  return null;
}

function numberForValidation(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function setFieldError(errors: Record<string, string>, fieldId: string, message: string) {
  if (!errors[fieldId]) {
    errors[fieldId] = message;
  }
}

function regexPatternSafetyIssue(pattern: string): string | null {
  if (!pattern || pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return "length";
  }
  if (!isSafeRegexSubset(pattern)) {
    return "safe_subset";
  }
  return null;
}

function isSafeRegexSubset(pattern: string): boolean {
  let canQuantify = false;
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === "^" || char === "$") {
      canQuantify = false;
      index += 1;
      continue;
    }
    if (char === "[") {
      const closeIndex = findCharacterClassEnd(pattern, index);
      if (closeIndex == null || closeIndex === index + 1) {
        return false;
      }
      canQuantify = true;
      index = closeIndex + 1;
      continue;
    }
    if (char === "\\") {
      const escaped = pattern[index + 1];
      if (!escaped) {
        return false;
      }
      if (safeRegexShorthandEscapes.has(escaped) || safeRegexLiteralEscapes.has(escaped)) {
        canQuantify = true;
        index += 2;
        continue;
      }
      return false;
    }
    if ("()|.".includes(char)) {
      return false;
    }
    if (char === "*" || char === "+") {
      return false;
    }
    if (char === "?") {
      return false;
    }
    if (char === "{") {
      if (!canQuantify) {
        return false;
      }
      const closeIndex = pattern.indexOf("}", index + 1);
      if (closeIndex === -1 || !isBoundedRepeat(pattern.slice(index + 1, closeIndex))) {
        return false;
      }
      canQuantify = false;
      index = closeIndex + 1;
      continue;
    }
    if (char === "}" || char === "]") {
      return false;
    }
    canQuantify = true;
    index += 1;
  }
  return true;
}

function findCharacterClassEnd(pattern: string, openIndex: number): number | null {
  for (let index = openIndex + 1; index < pattern.length; index += 1) {
    if (pattern[index] === "]" && !isEscaped(pattern, index)) {
      return index;
    }
  }
  return null;
}

function isBoundedRepeat(value: string): boolean {
  if (/^\d+$/.test(value)) {
    return Number(value) <= MAX_REGEX_REPEAT_BOUND;
  }
  return false;
}

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && value[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}

export function SchemaRenderer({
  schema,
  item,
  initialAnswers,
  readOnly = false,
  uploadContext,
  onChange,
  onSubmit,
}: SchemaRendererProps) {
  const [answers, setAnswers] = useState<AnswerPayload>(initialAnswers ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const visibleFieldIds = useMemo(() => getVisibleFieldIds(schema, answers), [schema, answers]);
  const fieldsById = useMemo(() => new Map(schema.fields.map((field) => [field.id, field])), [schema.fields]);
  const visibleAnswerableFields = useMemo(
    () => schema.fields.filter((field) => isAnswerableField(field) && visibleFieldIds.has(field.id)),
    [schema.fields, visibleFieldIds],
  );
  const visibleErrors = Object.entries(errors).filter(([fieldId]) => visibleFieldIds.has(fieldId));

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((currentAnswers) => {
      const nextAnswers = { ...currentAnswers, [fieldId]: value };
      onChange?.(nextAnswers);
      return nextAnswers;
    });
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[fieldId];
      return nextErrors;
    });
  }

  function handleSubmit() {
    const nextErrors = validateAnswers(schema, answers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      onSubmit?.(answers);
    }
  }

  function renderFieldFrame(field: TemplateField) {
    if (!visibleFieldIds.has(field.id)) {
      return null;
    }
    return (
      <div className="schema-field" key={field.id}>
        {renderField(field, item, answers, updateAnswer, readOnly, uploadContext)}
        {errors[field.id] ? <div className="field-error">{errors[field.id]}</div> : null}
      </div>
    );
  }

  function renderFieldList(fields: TemplateField[]) {
    return fields.map((field) => renderFieldFrame(field)).filter(Boolean);
  }

  function renderLayout() {
    const layout = schema.layout ?? { type: "single", groups: [] };
    if (layout.type === "tabs" && layout.groups.length > 0) {
      const groupedFieldIds = new Set(layout.groups.flatMap((group) => group.fieldIds));
      const items = layout.groups.map((group) => ({
        key: group.id,
        label: tabLabel(group, errors),
        children: (
          <div className="schema-renderer-fields">
            {group.description ? <Typography.Text type="secondary">{group.description}</Typography.Text> : null}
            {renderFieldList(fieldsForGroup(group, fieldsById))}
          </div>
        ),
      }));
      const ungroupedFields = schema.fields.filter((field) => !groupedFieldIds.has(field.id));
      if (ungroupedFields.length > 0) {
        items.push({
          key: "ungrouped",
          label: tabLabel({ title: "其他", fieldIds: ungroupedFields.map((field) => field.id) }, errors),
          children: <div className="schema-renderer-fields">{renderFieldList(ungroupedFields)}</div>,
        });
      }
      return <Tabs className="schema-tabs" items={items} />;
    }

    if (layout.type === "group" && layout.groups.length > 0) {
      const groupedFieldIds = new Set(layout.groups.flatMap((group) => group.fieldIds));
      const ungroupedFields = schema.fields.filter((field) => !groupedFieldIds.has(field.id));
      return (
        <div className="schema-groups">
          {layout.groups.map((group) => {
            const groupFields = fieldsForGroup(group, fieldsById);
            const renderedFields = renderFieldList(groupFields);
            if (renderedFields.length === 0) {
              return null;
            }
            return (
              <section className="schema-group" key={group.id} aria-label={group.title}>
                <Typography.Title level={4}>{group.title}</Typography.Title>
                {group.description ? <Typography.Text type="secondary">{group.description}</Typography.Text> : null}
                <div className="schema-renderer-fields">{renderedFields}</div>
              </section>
            );
          })}
          {ungroupedFields.length > 0 ? <div className="schema-renderer-fields">{renderFieldList(ungroupedFields)}</div> : null}
        </div>
      );
    }

    return <div className="schema-renderer-fields">{renderFieldList(schema.fields)}</div>;
  }

  return (
    <section className="schema-renderer" aria-label={schema.title}>
      <Typography.Title level={3}>{schema.title}</Typography.Title>
      {visibleErrors.length > 0 ? renderErrorSummary(visibleErrors, fieldsById) : null}
      {renderLayout()}
      {!readOnly && visibleAnswerableFields.length > 0 ? (
        <Button type="primary" onClick={handleSubmit}>
          提交
        </Button>
      ) : null}
    </section>
  );
}

function fieldsForGroup(group: LayoutGroup, fieldsById: Map<string, TemplateField>): TemplateField[] {
  return group.fieldIds.map((fieldId) => fieldsById.get(fieldId)).filter((field): field is TemplateField => Boolean(field));
}

function tabLabel(group: Pick<LayoutGroup, "title" | "fieldIds">, errors: Record<string, string>) {
  const errorCount = group.fieldIds.filter((fieldId) => Boolean(errors[fieldId])).length;
  return errorCount > 0 ? `${group.title} ${errorCount}` : group.title;
}

function renderErrorSummary(
  errorEntries: Array<[string, string]>,
  fieldsById: Map<string, TemplateField>,
) {
  return (
    <Alert
      type="error"
      message="请检查表单"
      description={
        <ul className="schema-error-summary">
          {errorEntries.map(([fieldId, message]) => {
            const field = fieldsById.get(fieldId);
            return (
              <li key={fieldId}>
                {field?.label ?? fieldId}: {message}
              </li>
            );
          })}
        </ul>
      }
    />
  );
}

function renderField(
  field: TemplateField,
  item: RendererItem,
  answers: AnswerPayload,
  updateAnswer: (fieldId: string, value: unknown) => void,
  readOnly: boolean,
  uploadContext: SchemaRendererProps["uploadContext"] | undefined,
) {
  if (field.type === "show_item") {
    return (
      <>
        <Typography.Text strong>{field.label}</Typography.Text>
        <pre className="show-item-value">{displayValue(resolveItemPath(item, field.source))}</pre>
      </>
    );
  }

  if (field.type === "text") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
          value={(answers[field.id] as string | undefined) ?? ""}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input.TextArea
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
          value={(answers[field.id] as string | undefined) ?? ""}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "rich_text") {
    const currentAnswer = answers[field.id];
    const value = isRichTextAnswer(currentAnswer) ? currentAnswer.content : "";
    if (readOnly) {
      return (
        <div className="schema-control">
          <span>{field.label}</span>
          <pre className="show-item-value">{value}</pre>
        </div>
      );
    }
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input.TextArea
          aria-label={field.label}
          placeholder={field.placeholder ?? undefined}
          value={value}
          onChange={(event) => updateAnswer(field.id, richTextAnswer(event.target.value))}
        />
      </label>
    );
  }

  if (field.type === "image_upload" || field.type === "file_upload") {
    return (
      <MediaUploadControl
        field={field}
        readOnly={readOnly}
        uploadContext={uploadContext}
        value={uploadAssets(answers[field.id])}
        onChange={(value) => updateAnswer(field.id, value)}
      />
    );
  }

  if (field.type === "number") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <InputNumber
          disabled={readOnly}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          value={answers[field.id] as number | undefined}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </label>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="schema-control">
        <span>{field.label}</span>
        <Radio.Group
          disabled={readOnly}
          value={answers[field.id] as string | undefined}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
        >
          <Space direction="vertical">{renderOptions(field)}</Space>
        </Radio.Group>
      </div>
    );
  }

  if (field.type === "checkbox_group") {
    return (
      <div className="schema-control">
        <span>{field.label}</span>
        <Checkbox.Group
          disabled={readOnly}
          options={field.options}
          value={(answers[field.id] as string[] | undefined) ?? []}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Select
          disabled={readOnly}
          options={field.options}
          value={answers[field.id] as string | undefined}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </label>
    );
  }

  if (field.type === "rating") {
    return (
      <div className="schema-control">
        <span>{field.label}</span>
        <Rate
          disabled={readOnly}
          count={field.max ?? 5}
          value={(answers[field.id] as number | undefined) ?? 0}
          onChange={(value) => updateAnswer(field.id, value)}
        />
      </div>
    );
  }

  if (field.type === "json") {
    return (
      <label className="schema-control">
        <span>{field.label}</span>
        <Input.TextArea
          disabled={readOnly}
          value={
            answers[field.id] === undefined
              ? ""
              : JSON.stringify(answers[field.id], null, 2)
          }
          onChange={(event) => {
            try {
              updateAnswer(field.id, JSON.parse(event.target.value));
            } catch {
              updateAnswer(field.id, event.target.value);
            }
          }}
        />
      </label>
    );
  }

  return (
    <div className="schema-control">
      <span>{field.label}</span>
      <Button disabled={readOnly}>{field.label}</Button>
    </div>
  );
}

function renderOptions(field: OptionField) {
  return field.options.map((option) => (
    <Radio key={option.value} value={option.value}>
      {option.label}
    </Radio>
  ));
}

type MediaUploadControlProps = {
  field: ImageUploadField | FileUploadField;
  readOnly: boolean;
  uploadContext: SchemaRendererProps["uploadContext"] | undefined;
  value: UploadAssetAnswer[];
  onChange: (value: UploadAssetAnswer[]) => void;
};

function MediaUploadControl({
  field,
  readOnly,
  uploadContext,
  value,
  onChange,
}: MediaUploadControlProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = [...field.acceptedMimeTypes, ...(field.type === "file_upload" ? field.acceptedExtensions ?? [] : [])]
    .filter(Boolean)
    .join(",");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || readOnly) {
      return;
    }
    if (!uploadContext) {
      setError("当前页面缺少上传上下文。");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const remainingSlots = Math.max(0, field.maxCount - value.length);
      const selectedFiles = files.slice(0, remainingSlots);
      const uploaded = await Promise.all(
        selectedFiles.map((file) => uploadAsset(uploadContext.assignmentId, field.id, file)),
      );
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败。");
    } finally {
      setUploading(false);
    }
  }

  function removeAsset(assetId: string) {
    onChange(value.filter((asset) => asset.assetId !== assetId));
  }

  return (
    <div className="schema-control media-upload-control">
      <span>{field.label}</span>
      {field.helpText ? <Typography.Text type="secondary">{field.helpText}</Typography.Text> : null}
      {field.type === "image_upload" ? (
        <div className="media-preview-grid">
          {value.map((asset) => (
            <div className="media-asset" key={asset.assetId}>
              <AuthenticatedImage asset={asset} label={field.label} />
              <Typography.Text>{asset.filename}</Typography.Text>
              {!readOnly ? (
                <Button size="small" onClick={() => removeAsset(asset.assetId)}>
                  移除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="media-file-list">
          {value.map((asset) => (
            <div className="media-file-row" key={asset.assetId}>
              <Typography.Text>{asset.filename}</Typography.Text>
              <Typography.Text type="secondary">{formatBytes(asset.sizeBytes)}</Typography.Text>
              <Button size="small" onClick={() => void downloadAsset(asset)}>
                下载 {asset.filename}
              </Button>
              {!readOnly ? (
                <Button size="small" onClick={() => removeAsset(asset.assetId)}>
                  移除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {!readOnly && value.length < field.maxCount ? (
        <label className="media-upload-input">
          <span>上传 {field.label}</span>
          <input
            aria-label={`上传 ${field.label}`}
            accept={accept || undefined}
            disabled={uploading}
            multiple={field.maxCount > 1}
            type="file"
            onChange={(event) => void handleFileChange(event)}
          />
        </label>
      ) : null}
      {!readOnly ? (
        <Typography.Text type="secondary">
          最多 {field.maxCount} 个文件，单个不超过 {formatBytes(field.maxFileSizeBytes)}
        </Typography.Text>
      ) : null}
      {error ? <Alert message={error} type="error" /> : null}
    </div>
  );
}

function AuthenticatedImage({ asset, label }: { asset: UploadAssetAnswer; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetchWithAuth(asset.downloadUrl, { method: "GET" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response));
        }
        return response.blob();
      })
      .then((blob) => {
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [asset.downloadUrl]);

  if (error) {
    return <Typography.Text type="secondary">图片预览不可用</Typography.Text>;
  }
  if (!src) {
    return <Typography.Text type="secondary">加载预览...</Typography.Text>;
  }
  return <img alt={`${label} preview ${asset.filename}`} className="media-image-preview" src={src} />;
}

async function uploadAsset(assignmentId: string, fieldId: string, file: File): Promise<UploadAssetAnswer> {
  const form = new FormData();
  form.append("field_id", fieldId);
  form.append("file", file);
  const response = await fetchWithAuth(`/labeler/assignments/${assignmentId}/uploads`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const payload = (await response.json()) as UploadAssetResponse;
  return {
    assetId: payload.id,
    filename: payload.filename,
    contentType: payload.content_type,
    sizeBytes: payload.size_bytes,
    downloadUrl: payload.download_url,
  };
}

async function downloadAsset(asset: UploadAssetAnswer) {
  const response = await fetchWithAuth(asset.downloadUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = asset.filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KiB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MiB`;
}

type UploadAssetResponse = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
};
