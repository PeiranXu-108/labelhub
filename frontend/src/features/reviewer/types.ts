import type { TaskRead, TemplateSchemaRead } from "../owner/types";
import type { HumanReviewRead, SubmissionRead, TaskItemRead } from "../labeler/types";
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
  latest_ai_review: AIReviewRead | null;
  latest_human_review: HumanReviewRead | null;
};

export type ReviewQueueFilters = {
  task_id?: string;
  status?: string;
  ai_decision?: string;
  min_score?: number;
  max_score?: number;
};

export type ReviewSubmissionDetail = {
  submission: SubmissionRead;
  task: TaskRead;
  item: TaskItemRead;
  template_schema: TemplateSchemaRead;
  agent_workflow: AgentWorkflowRead;
  ai_reviews: AIReviewRead[];
  human_reviews: HumanReviewRead[];
  audit_logs: AuditLogRead[];
  previous_attempts: SubmissionAttemptRead[];
};
