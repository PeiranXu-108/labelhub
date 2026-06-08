import type { TaskRead, TemplateSchemaRead } from "../owner/types";
import type { HumanReviewRead, ReviewStage, SubmissionRead, TaskItemRead } from "../labeler/types";
import type { AgentWorkflowRead } from "../agent-workflow/types";

export type AuditLogRead = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_role: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AIReviewRead = {
  id: string;
  submission_id: string;
  decision: string;
  overall_score: number;
  status: string;
  structured_response: Record<string, unknown>;
  prompt_snapshot: string | null;
  model_name: string | null;
  created_at: string;
};

export type SubmissionAttemptRead = {
  id: string;
  submission_id: string;
  attempt: number;
  template_schema_id: string;
  schema_version: number;
  answer_payload: Record<string, unknown>;
  submitted_at: string;
  created_at: string;
};

export type ReviewQueueItemRead = {
  submission: SubmissionRead;
  task: TaskRead;
  current_stage: ReviewStage | null;
  latest_ai_review: AIReviewRead | null;
  latest_human_review: HumanReviewRead | null;
};

export type ReviewerSLAContextRead = {
  source: string;
  reference_time: string;
  nearest_deadline_at: string | null;
  seconds_until_nearest_deadline: number | null;
  overdue_count: number;
  pending_with_deadline_count: number;
};

export type ReviewerMetricsRead = {
  reviewed_today: number;
  approved_today: number;
  returned_today: number;
  pass_rate: number | null;
  pending_review_count: number;
  sla: ReviewerSLAContextRead;
};

export type ReviewQueueFilters = {
  task_id?: string;
  status?: string;
  ai_decision?: string;
  min_score?: number;
  max_score?: number;
  review_stage?: string;
};

export type ReviewRoundDiffFieldRead = {
  field_id: string;
  field_label: string;
  change_type: "added" | "removed" | "changed";
  from_value: unknown;
  to_value: unknown;
};

export type ReviewRoundDiffRead = {
  from_attempt: number;
  to_attempt: number;
  fields: ReviewRoundDiffFieldRead[];
};

export type ReviewSubmissionDetail = {
  submission: SubmissionRead;
  task: TaskRead;
  item: TaskItemRead;
  template_schema: TemplateSchemaRead;
  agent_workflow: AgentWorkflowRead;
  current_stage: ReviewStage | null;
  ai_reviews: AIReviewRead[];
  human_reviews: HumanReviewRead[];
  stage_history: HumanReviewRead[];
  round_diffs: ReviewRoundDiffRead[];
  audit_logs: AuditLogRead[];
  previous_attempts: SubmissionAttemptRead[];
};

export type ReviewAuditExportSubmissionRead = {
  submission: SubmissionRead;
  task: TaskRead;
  audit_logs: AuditLogRead[];
  ai_reviews: AIReviewRead[];
  human_reviews: HumanReviewRead[];
};

export type ReviewAuditExportRead = {
  scope: string;
  task_id: string;
  generated_at: string;
  submission_count: number;
  submissions: ReviewAuditExportSubmissionRead[];
};
