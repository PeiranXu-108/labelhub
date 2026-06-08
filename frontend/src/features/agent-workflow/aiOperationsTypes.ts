import type { AuditLogRead } from "../reviewer/types";
import type { AgentWorkflowRead } from "./types";
import type { ReviewStage, SubmissionRead, TaskItemRead } from "../labeler/types";
import type { TaskRead, TemplateSchemaRead } from "../owner/types";

export type AIOperationRunStatus =
  | "pending"
  | "running"
  | "passed"
  | "returned"
  | "human_review"
  | "failed";

export type AIOperationRunFilters = {
  run_status?: AIOperationRunStatus | "all";
  task_id?: string;
  ai_decision?: string;
};

export type AIOperationReviewConfigRead = {
  id: string;
  task_id: string;
  prompt_template: string;
  criteria: Array<Record<string, unknown>>;
  pass_threshold: number;
  return_threshold: number;
  manual_review_threshold: number;
  model_name: string;
  temperature: number;
  max_retries: number;
};

export type AIOperationReviewRead = {
  id: string;
  submission_id: string;
  decision: string;
  overall_score: number;
  status: string;
  structured_response: Record<string, unknown>;
  prompt_snapshot: string | null;
  model_name: string | null;
  raw_provider_response: Record<string, unknown> | null;
  error_metadata: Record<string, unknown> | null;
  retry_count: number;
  idempotency_key: string;
  created_at: string;
};

export type AIOperationRunListItemRead = {
  submission_id: string;
  task_id: string;
  task_name: string;
  labeler_id: string;
  attempt: number;
  run_status: AIOperationRunStatus;
  workflow_status: string;
  current_stage: ReviewStage | null;
  ai_decision: string | null;
  overall_score: number | null;
  model_name: string | null;
  retry_count: number;
  operator_retry_count: number;
  idempotency_key: string;
  latest_ai_review_id: string | null;
  latest_ai_review_status: string | null;
  submitted_at: string | null;
  last_run_at: string | null;
  updated_at: string;
};

export type AIOperationVerdictRead = {
  decision: string | null;
  summary: string | null;
  return_reasons: string[];
  suggestions: string[];
};

export type AIOperationRunDetailRead = AIOperationRunListItemRead & {
  submission: SubmissionRead;
  task: TaskRead;
  item: TaskItemRead;
  template_schema: TemplateSchemaRead;
  review_config: AIOperationReviewConfigRead;
  agent_workflow: AgentWorkflowRead;
  latest_ai_review: AIOperationReviewRead | null;
  ai_reviews: AIOperationReviewRead[];
  audit_logs: AuditLogRead[];
  processing_logs: AuditLogRead[];
  item_payload: Record<string, unknown>;
  answer_payload: Record<string, unknown>;
  score_dimensions: Array<Record<string, unknown>>;
  verdict: AIOperationVerdictRead;
};

export type AIOperationRetryResponse = {
  retry_performed: boolean;
  detail: AIOperationRunDetailRead;
};
