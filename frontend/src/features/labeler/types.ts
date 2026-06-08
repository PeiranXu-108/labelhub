import type { TaskRead, TemplateSchemaRead } from "../owner/types";
import type { AgentWorkflowRead } from "../agent-workflow/types";
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

export type ReviewStage = "initial_review" | "re_review" | "final_review";

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
  review_stage: ReviewStage | null;
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
  stage: ReviewStage;
  round: number;
  compared_from_attempt: number | null;
  compared_to_attempt: number | null;
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
  agentWorkflow: AgentWorkflowRead | null;
};

export type AssignmentNavigationRead = {
  assignment_id: string;
  task_id: string;
  previous_assignment_id: string | null;
  next_assignment_id: string | null;
  can_claim_next: boolean;
  has_previous: boolean;
  has_next: boolean;
  no_work_left: boolean;
  current_position: number;
  total_count: number;
  items: AssignmentNavigationItemRead[];
  contribution: AssignmentContributionRead;
  history: AssignmentHistoryEventRead[];
};

export type AssignmentNavigationItemRead = {
  item_id: string;
  external_id: string | null;
  assignment_id: string | null;
  submission_id: string | null;
  labeler_id: string | null;
  position: number;
  status: string;
  assignment_status: string | null;
  is_current: boolean;
  is_navigable: boolean;
  navigation_action: "open" | "next" | null;
};

export type AssignmentContributionRead = {
  task_id: string;
  labeler_id: string;
  draft_count: number;
  submitted_count: number;
  approved_passed_count: number;
  returned_rejected_count: number;
  total_owned_count: number;
};

export type AssignmentHistoryEventRead = {
  id: string;
  kind: "audit" | "ai_review" | "human_review";
  action: string;
  title: string;
  summary: string | null;
  actor_role: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
};

export type AssignmentNavigationMoveRead = {
  direction: "previous" | "next" | "skip";
  assignment: AssignmentDetailRead | null;
  navigation: AssignmentNavigationRead | null;
  no_work_left: boolean;
  message: string;
  skipped_assignment_id: string | null;
  skip_reason: string | null;
};

export type ProblemReportRead = {
  id: string;
  assignment_id: string;
  task_item_id: string;
  labeler_id: string;
  category: string;
  note: string;
  created_at: string;
};
