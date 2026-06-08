import { apiRequest } from "../auth/http";
import type { AgentWorkflowRead } from "../agent-workflow/types";
import type { TaskRead } from "../owner/types";
import type { AnswerPayload } from "../schema-renderer";
import type {
  AssignmentDetailRead,
  AssignmentLoadResult,
  AssignmentNavigationMoveRead,
  AssignmentNavigationRead,
  ClaimRead,
  ProblemReportRead,
  SubmissionRead,
} from "./types";

export function listMarketplaceTasks() {
  return apiRequest<TaskRead[]>("/labeler/tasks");
}

export function claimTask(taskId: string) {
  return apiRequest<ClaimRead>(`/labeler/tasks/${taskId}/claim`, { method: "POST" });
}

export function getAssignment(assignmentId: string) {
  return apiRequest<AssignmentDetailRead>(`/labeler/assignments/${assignmentId}`);
}

export function getAssignmentAgentWorkflow(assignmentId: string) {
  return apiRequest<AgentWorkflowRead>(`/labeler/assignments/${assignmentId}/agent-workflow`);
}

export function getAssignmentNavigation(assignmentId: string) {
  return apiRequest<AssignmentNavigationRead>(`/labeler/assignments/${assignmentId}/navigation`);
}

export async function getAssignmentWithTemplate(assignmentId: string): Promise<AssignmentLoadResult> {
  const [assignment, agentWorkflow] = await Promise.all([
    getAssignment(assignmentId),
    getAssignmentAgentWorkflow(assignmentId).catch(() => null),
  ]);
  return { assignment, template: assignment.template_schema, agentWorkflow };
}

export function saveAssignmentDraft(assignmentId: string, answerPayload: AnswerPayload) {
  return apiRequest<SubmissionRead>(`/labeler/assignments/${assignmentId}/draft`, {
    method: "PUT",
    body: { answer_payload: answerPayload },
  });
}

export function submitAssignment(assignmentId: string, answerPayload: AnswerPayload) {
  return apiRequest<SubmissionRead>(`/labeler/assignments/${assignmentId}/submit`, {
    method: "POST",
    body: { answer_payload: answerPayload },
  });
}

export function navigateToPreviousAssignment(assignmentId: string) {
  return apiRequest<AssignmentNavigationMoveRead>(`/labeler/assignments/${assignmentId}/previous`, {
    method: "POST",
  });
}

export function navigateToNextAssignment(assignmentId: string) {
  return apiRequest<AssignmentNavigationMoveRead>(`/labeler/assignments/${assignmentId}/next`, {
    method: "POST",
  });
}

export function skipAssignment(assignmentId: string, reason: string | null) {
  return apiRequest<AssignmentNavigationMoveRead>(`/labeler/assignments/${assignmentId}/skip`, {
    method: "POST",
    body: { reason },
  });
}

export function reportAssignmentProblem(assignmentId: string, category: string, note: string) {
  return apiRequest<ProblemReportRead>(`/labeler/assignments/${assignmentId}/problem-reports`, {
    method: "POST",
    body: { category, note },
  });
}

export function listOwnSubmissions() {
  return apiRequest<SubmissionRead[]>("/labeler/submissions");
}
