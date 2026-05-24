import type { TaskRead, TemplateSchemaRead } from "../owner/types";
import type { AnswerPayload } from "../schema-renderer";

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "ai_reviewing"
  | "ai_passed"
  | "ai_returned"
  | "needs_human_review"
  | "human_reviewing"
  | "approved"
  | "returned"
  | "exportable";

export type SubmissionRead = {
  id: string;
  task_id: string;
  item_id: string;
  assignment_id: string | null;
  labeler_id: string;
  template_schema_id: string;
  schema_version: number;
  answer_payload: AnswerPayload;
  status: SubmissionStatus;
  attempt: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HumanReviewRead = {
  id: string;
  submission_id: string;
  reviewer_id: string;
  decision: string;
  reason: string | null;
  review_metadata: Record<string, unknown>;
  created_at: string;
};

export type TaskItemRead = {
  id: string;
  task_id: string;
  external_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export type ClaimRead = {
  id: string;
  task_id: string;
  item_id: string;
  labeler_id: string;
  status: string;
  claimed_at: string;
  expires_at: string | null;
  item: TaskItemRead;
  submission: SubmissionRead;
};

export type AssignmentDetailRead = ClaimRead & {
  task: TaskRead;
  template_schema: TemplateSchemaRead;
  latest_human_review: HumanReviewRead | null;
};

export type AssignmentLoadResult = {
  assignment: AssignmentDetailRead;
  template: TemplateSchemaRead;
};
