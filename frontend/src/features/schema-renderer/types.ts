export type TemplateFieldType =
  | "show_item"
  | "text"
  | "textarea"
  | "number"
  | "radio"
  | "checkbox_group"
  | "select"
  | "rating"
  | "json"
  | "rich_text"
  | "image_upload"
  | "file_upload"
  | "llm_trigger";

export type TemplateOption = {
  label: string;
  value: string;
};

export type BaseTemplateField = {
  id: string;
  type: TemplateFieldType;
  label: string;
  required?: boolean;
  helpText?: string | null;
};

export type ShowItemField = BaseTemplateField & {
  type: "show_item";
  source: string;
};

export type TextField = BaseTemplateField & {
  type: "text" | "textarea";
  placeholder?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
};

export type NumberField = BaseTemplateField & {
  type: "number";
  min?: number | null;
  max?: number | null;
};

export type OptionField = BaseTemplateField & {
  type: "radio" | "checkbox_group" | "select";
  options: TemplateOption[];
};

export type RatingField = BaseTemplateField & {
  type: "rating";
  min?: number;
  max?: number;
};

export type JsonField = BaseTemplateField & {
  type: "json";
};

export type RichTextField = BaseTemplateField & {
  type: "rich_text";
  placeholder?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  plainTextFallback?: boolean;
};

export type UploadAssetAnswer = {
  assetId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type ImageUploadField = BaseTemplateField & {
  type: "image_upload";
  acceptedMimeTypes: string[];
  maxFileSizeBytes: number;
  maxCount: number;
};

export type FileUploadField = BaseTemplateField & {
  type: "file_upload";
  acceptedMimeTypes: string[];
  acceptedExtensions?: string[];
  maxFileSizeBytes: number;
  maxCount: number;
};

export type LlmTriggerMode = "suggest" | "prefill" | "overwrite_with_confirmation";

export type LlmOutputSchema = {
  preset?: "target_field" | "text" | "number" | "json_object" | "json_array";
  jsonSchema?: Record<string, unknown> | null;
};

export type LlmTriggerField = BaseTemplateField & {
  type: "llm_trigger";
  promptTemplate: string;
  targetFieldId: string;
  mode?: LlmTriggerMode;
  outputSchema?: LlmOutputSchema;
  contextFields?: string[];
  temperature?: number | null;
};

export type TemplateField =
  | ShowItemField
  | TextField
  | NumberField
  | OptionField
  | RatingField
  | JsonField
  | RichTextField
  | ImageUploadField
  | FileUploadField
  | LlmTriggerField;

export type LayoutGroup = {
  id: string;
  title: string;
  description?: string | null;
  fieldIds: string[];
};

export type TemplateLayout = {
  type: "single" | "group" | "tabs";
  groups: LayoutGroup[];
};

export type VisibilityCondition = {
  sourceFieldId: string;
  operator:
    | "equals"
    | "not_equals"
    | "in"
    | "not_in"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "is_not_empty";
  value?: unknown;
};

export type VisibilityRule = {
  id?: string | null;
  targetFieldId: string;
  effect?: "show";
  condition: VisibilityCondition;
};

type BaseAnswerValidation = {
  fieldId: string;
  message?: string | null;
};

export type AnswerValidation =
  | (BaseAnswerValidation & { type: "required" })
  | (BaseAnswerValidation & { type: "min_length"; limit: number })
  | (BaseAnswerValidation & { type: "max_length"; limit: number })
  | (BaseAnswerValidation & { type: "min"; value: number })
  | (BaseAnswerValidation & { type: "max"; value: number })
  | (BaseAnswerValidation & { type: "regex"; pattern: string; flags?: Array<"i"> })
  | (BaseAnswerValidation & {
      type: "compare";
      operator:
        | "equals"
        | "not_equals"
        | "greater_than"
        | "greater_than_or_equal"
        | "less_than"
        | "less_than_or_equal";
      otherFieldId: string;
    })
  | (BaseAnswerValidation & {
      type: "custom";
      name: "no_whitespace_edges" | "non_empty_json_object" | "https_url";
    });

export type TemplateSchemaDocument = {
  version: number;
  title: string;
  layout: TemplateLayout;
  fields: TemplateField[];
  llmTools: Array<{
    id: string;
    label: string;
    promptTemplate: string;
    targetFieldId: string;
  }>;
  validations: AnswerValidation[];
  visibilityRules: VisibilityRule[];
};

export type RendererItem = {
  id?: string;
  external_id?: string | null;
  payload: Record<string, unknown>;
};

export type AnswerPayload = Record<string, unknown>;
