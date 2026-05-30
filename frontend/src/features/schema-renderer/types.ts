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

export type LlmTriggerField = BaseTemplateField & {
  type: "llm_trigger";
  promptTemplate: string;
  targetFieldId: string;
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

export type TemplateSchemaDocument = {
  version: number;
  title: string;
  layout: {
    type: "single";
    groups: Array<Record<string, unknown>>;
  };
  fields: TemplateField[];
  llmTools: Array<{
    id: string;
    label: string;
    promptTemplate: string;
    targetFieldId: string;
  }>;
  validations: Array<Record<string, unknown>>;
  visibilityRules: Array<Record<string, unknown>>;
};

export type RendererItem = {
  id?: string;
  external_id?: string | null;
  payload: Record<string, unknown>;
};

export type AnswerPayload = Record<string, unknown>;
