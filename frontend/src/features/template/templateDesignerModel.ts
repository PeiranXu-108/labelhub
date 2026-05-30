import type {
  LlmTriggerField,
  NumberField,
  OptionField,
  RatingField,
  ShowItemField,
  TemplateField,
  TemplateFieldType,
  TemplateOption,
  TemplateSchemaDocument,
  TextField,
} from "../schema-renderer";

export const FIELD_TYPE_DRAG_DATA = "application/x-labelhub-field-type";
export const FIELD_INDEX_DRAG_DATA = "application/x-labelhub-field-index";

export const fieldPalette: Array<{ type: TemplateFieldType; label: string }> = [
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

const supportedTypes = new Set<TemplateFieldType>(fieldPalette.map((item) => item.type));
const fieldIdPattern = /^[A-Za-z][A-Za-z0-9_]*$/;
const itemSourcePattern = /^item\.payload(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FIELD_ID_MAX_LENGTH = 64;
const LABEL_MAX_LENGTH = 255;
const HELP_TEXT_MAX_LENGTH = 500;
const PROMPT_TEMPLATE_MAX_LENGTH = 5000;

export function validateTemplateSchema(schema: TemplateSchemaDocument): string[] {
  const issues: string[] = [];
  if (!schema.title.trim()) {
    issues.push("模板标题不能为空");
  } else if (schema.title.length > LABEL_MAX_LENGTH) {
    issues.push("模板标题不能超过 255 个字符");
  }
  if (schema.layout.type !== "single") {
    issues.push("当前仅支持单列布局");
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    issues.push("模板至少需要 1 个字段");
    return issues;
  }

  const fieldIds = new Map<string, number>();
  schema.fields.forEach((field, index) => {
    const fieldName = field.id || field.label || `字段 ${index + 1}`;
    if (!supportedTypes.has(field.type)) {
      issues.push(`${fieldName} 使用了不支持的字段类型`);
    }
    if (!field.id.trim()) {
      issues.push(`字段 ${index + 1} 的 ID 不能为空`);
    } else if (field.id.length > FIELD_ID_MAX_LENGTH) {
      issues.push(`${field.id} 的字段 ID 不能超过 64 个字符`);
    } else if (!fieldIdPattern.test(field.id)) {
      issues.push(`${field.id} 的字段 ID 必须以字母开头且只能包含字母、数字和下划线`);
    } else {
      fieldIds.set(field.id, (fieldIds.get(field.id) ?? 0) + 1);
    }
    if (!field.label.trim()) {
      issues.push(`${fieldName} 的标签不能为空`);
    } else if (field.label.length > LABEL_MAX_LENGTH) {
      issues.push(`${fieldName} 的标签不能超过 255 个字符`);
    }
    if ((field.helpText ?? "").length > HELP_TEXT_MAX_LENGTH) {
      issues.push(`${fieldName} 的帮助文本不能超过 500 个字符`);
    }

    validateFieldSpecifics(field, fieldName, issues);
  });

  fieldIds.forEach((count, fieldId) => {
    if (count > 1) {
      issues.push(`${fieldId} 的字段 ID 不能重复`);
    }
  });

  const fieldIdSet = new Set(schema.fields.map((field) => field.id));
  schema.fields.forEach((field) => {
    if (field.type === "llm_trigger" && !fieldIdSet.has(field.targetFieldId)) {
      issues.push(`${field.id} 的目标字段必须引用已有字段`);
    }
  });
  schema.llmTools.forEach((tool) => {
    if (!tool.id.trim()) {
      issues.push("llmTools ID 不能为空");
    } else if (tool.id.length > FIELD_ID_MAX_LENGTH) {
      issues.push(`${tool.id} 的 llmTools ID 不能超过 64 个字符`);
    }
    if (!tool.label.trim()) {
      issues.push(`${tool.id} 的 llmTools 标签不能为空`);
    } else if (tool.label.length > LABEL_MAX_LENGTH) {
      issues.push(`${tool.id} 的 llmTools 标签不能超过 255 个字符`);
    }
    if (!tool.promptTemplate.trim()) {
      issues.push(`${tool.id} 的 llmTools Prompt 模板不能为空`);
    } else if (tool.promptTemplate.length > PROMPT_TEMPLATE_MAX_LENGTH) {
      issues.push(`${tool.id} 的 llmTools Prompt 模板不能超过 5000 个字符`);
    }
    if (!tool.targetFieldId.trim()) {
      issues.push(`${tool.id} 的 llmTools 目标字段不能为空`);
    } else if (tool.targetFieldId.length > FIELD_ID_MAX_LENGTH) {
      issues.push(`${tool.id} 的 llmTools 目标字段不能超过 64 个字符`);
    }
    if (!fieldIdSet.has(tool.targetFieldId)) {
      issues.push(`${tool.id} 的 llmTools 目标字段必须引用已有字段`);
    }
  });

  return issues;
}

function validateFieldSpecifics(field: TemplateField, fieldName: string, issues: string[]) {
  if (isShowItemField(field)) {
    if (!field.source.trim()) {
      issues.push(`${fieldName} 的数据源路径不能为空`);
    } else if (field.source.length > LABEL_MAX_LENGTH) {
      issues.push(`${fieldName} 的数据源路径不能超过 255 个字符`);
    } else if (!itemSourcePattern.test(field.source)) {
      issues.push(`${fieldName} 的数据源路径必须使用 item.payload 路径`);
    }
    return;
  }

  if (isTextField(field)) {
    if ((field.placeholder ?? "").length > 255) {
      issues.push(`${fieldName} 的占位提示不能超过 255 个字符`);
    }
    if (field.minLength != null && field.minLength < 0) {
      issues.push(`${fieldName} 的最小长度不能小于 0`);
    }
    if (field.maxLength != null && field.maxLength < 1) {
      issues.push(`${fieldName} 的最大长度不能小于 1`);
    }
    if (field.minLength != null && field.maxLength != null && field.maxLength < field.minLength) {
      issues.push(`${fieldName} 的最大长度不能小于最小长度`);
    }
    return;
  }

  if (isNumberField(field)) {
    if (field.min != null && field.max != null && field.max < field.min) {
      issues.push(`${fieldName} 的最大值不能小于最小值`);
    }
    return;
  }

  if (isOptionField(field)) {
    validateOptions(field, issues);
    return;
  }

  if (isRatingField(field)) {
    if ((field.min ?? 1) < 0) {
      issues.push(`${fieldName} 的评分最小值不能小于 0`);
    }
    if ((field.max ?? 5) < 1) {
      issues.push(`${fieldName} 的评分最大值不能小于 1`);
    }
    if ((field.max ?? 5) <= (field.min ?? 1)) {
      issues.push(`${fieldName} 的评分最大值必须大于最小值`);
    }
    return;
  }

  if (isLlmTriggerField(field)) {
    if (!field.promptTemplate.trim()) {
      issues.push(`${fieldName} 的 Prompt 模板不能为空`);
    }
    if (field.promptTemplate.length > PROMPT_TEMPLATE_MAX_LENGTH) {
      issues.push(`${fieldName} 的 Prompt 模板不能超过 5000 个字符`);
    }
    if (!field.targetFieldId.trim()) {
      issues.push(`${fieldName} 的目标字段不能为空`);
    } else if (field.targetFieldId.length > FIELD_ID_MAX_LENGTH) {
      issues.push(`${fieldName} 的目标字段不能超过 64 个字符`);
    } else if (!fieldIdPattern.test(field.targetFieldId)) {
      issues.push(`${fieldName} 的目标字段必须是有效字段 ID`);
    }
  }
}

function validateOptions(field: OptionField, issues: string[]) {
  if (field.options.length === 0) {
    issues.push(`${field.id} 至少需要 1 个选项`);
    return;
  }
  const values = new Set<string>();
  let hasDuplicateValue = false;
  field.options.forEach((option, index) => {
    if (!option.label.trim()) {
      issues.push(`${field.id} 的选项 ${index + 1} 标签不能为空`);
    } else if (option.label.length > LABEL_MAX_LENGTH) {
      issues.push(`${field.id} 的选项 ${index + 1} 标签不能超过 255 个字符`);
    }
    if (!option.value.trim()) {
      issues.push(`${field.id} 的选项 ${index + 1} 值不能为空`);
    } else if (option.value.length > LABEL_MAX_LENGTH) {
      issues.push(`${field.id} 的选项 ${index + 1} 值不能超过 255 个字符`);
    }
    if (values.has(option.value)) {
      hasDuplicateValue = true;
    }
    values.add(option.value);
  });
  if (hasDuplicateValue) {
    issues.push(`${field.id} 的选项值不能重复`);
  }
}

export function createField(type: TemplateFieldType, fields: TemplateField[]): TemplateField {
  const nextIndex = fields.filter((field) => field.type === type).length + 1;
  const base = {
    id: uniqueFieldId(`${type === "checkbox_group" ? "checkbox" : type}_${nextIndex}`, fields),
    label: defaultLabel(type),
    required: false,
  };

  switch (type) {
    case "show_item":
      return {
        ...base,
        id: uniqueFieldId(`raw_text_${nextIndex}`, fields),
        type,
        label: "原始文本",
        source: "item.payload.text",
      };
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
        targetFieldId: fields.find((field) => field.type !== "show_item" && field.type !== "llm_trigger")?.id ?? "summary",
        required: false,
      };
    default:
      return { ...base, type, label: defaultLabel(type) } as TemplateField;
  }
}

export function duplicateField(field: TemplateField, fields: TemplateField[]): TemplateField {
  const nextField = cloneField(field);
  return {
    ...nextField,
    id: uniqueFieldId(`${field.id}_copy`, fields),
    label: `${field.label} 副本`,
    required: field.type === "show_item" || field.type === "llm_trigger" ? false : field.required,
  } as TemplateField;
}

export function moveField(fields: TemplateField[], fromIndex: number, toIndex: number): TemplateField[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= fields.length || toIndex >= fields.length) {
    return fields;
  }
  const nextFields = [...fields];
  const [field] = nextFields.splice(fromIndex, 1);
  nextFields.splice(toIndex, 0, field);
  return nextFields;
}

export function isTextField(field: TemplateField): field is TextField {
  return field.type === "text" || field.type === "textarea";
}

export function isNumberField(field: TemplateField): field is NumberField {
  return field.type === "number";
}

export function isOptionField(field: TemplateField): field is OptionField {
  return field.type === "radio" || field.type === "checkbox_group" || field.type === "select";
}

export function isRatingField(field: TemplateField): field is RatingField {
  return field.type === "rating";
}

export function isShowItemField(field: TemplateField): field is ShowItemField {
  return field.type === "show_item";
}

export function isLlmTriggerField(field: TemplateField): field is LlmTriggerField {
  return field.type === "llm_trigger";
}

export function emptyToNull(value: string): string | null {
  return value.trim() ? value : null;
}

function uniqueFieldId(seed: string, fields: TemplateField[]): string {
  const existingIds = new Set(fields.map((field) => field.id));
  if (!existingIds.has(seed)) {
    return seed;
  }
  let suffix = 2;
  let candidate = `${seed}_${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${seed}_${suffix}`;
  }
  return candidate;
}

function cloneField(field: TemplateField): TemplateField {
  if (isOptionField(field)) {
    return { ...field, options: field.options.map((option) => ({ ...option })) };
  }
  return { ...field };
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

function defaultOptions(): TemplateOption[] {
  return [
    { label: "选项 A", value: "option_a" },
    { label: "选项 B", value: "option_b" },
  ];
}
