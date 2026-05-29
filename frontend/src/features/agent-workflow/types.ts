export type AgentWorkflowStepRead = {
  key: string;
  label: string;
  status: string;
  timestamp: string | null;
  actor_role: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
};

export type AgentWorkflowRead = {
  submission_id: string;
  assignment_id: string | null;
  task_id: string;
  current_status: string;
  steps: AgentWorkflowStepRead[];
};

export type TaskAgentWorkflowSummaryRead = {
  task_id: string;
  submission_status_counts: Record<string, number>;
  ai_decision_counts: Record<string, number>;
  pending_count: number;
  failed_count: number;
  recent_workflows: AgentWorkflowRead[];
};
