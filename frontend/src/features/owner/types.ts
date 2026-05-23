import type { TemplateSchemaDocument } from "../schema-renderer";

export type TaskStatus = "draft" | "published" | "paused" | "ended";

export type TaskRead = {
  id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  distribution_strategy: string;
  quota_per_labeler: number | null;
  deadline_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskCreate = {
  name: string;
  description: string | null;
  distribution_strategy: string;
  quota_per_labeler: number | null;
  deadline_at: string | null;
};

export type TaskUpdate = Partial<Omit<TaskCreate, "distribution_strategy">>;

export type TaskItemRead = {
  id: string;
  task_id: string;
  external_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export type ItemImportEntry = {
  external_id?: string | null;
  payload: Record<string, unknown>;
};

export type ReviewConfig = {
  id?: string;
  task_id?: string;
  prompt_template: string;
  criteria: Array<Record<string, unknown>>;
  pass_threshold: number;
  return_threshold: number;
  manual_review_threshold: number;
  model_name: string;
  temperature: number;
  max_retries: number;
  created_at?: string;
  updated_at?: string;
};

export type TemplateSchemaRead = {
  id: string;
  task_id: string;
  version: number;
  title: string;
  schema_payload: TemplateSchemaDocument;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
};

export type ExportFormat = "json" | "jsonl" | "csv" | "xlsx";

export type ExportJobRead = {
  id: string;
  task_id: string;
  created_by: string;
  format: ExportFormat;
  field_mapping: Record<string, string>;
  include_review_metadata: boolean;
  status: "pending" | "running" | "succeeded" | "failed" | string;
  file_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ExportCreate = {
  format: ExportFormat;
  field_mapping: Record<string, string>;
  include_review_metadata: boolean;
};
