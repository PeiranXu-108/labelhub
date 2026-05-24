import { apiRequest } from "../owner/api";
import type { TaskRead } from "../owner/types";
import type { AnswerPayload } from "../schema-renderer";
import type { AssignmentDetailRead, AssignmentLoadResult, ClaimRead, SubmissionRead } from "./types";

export function listMarketplaceTasks() {
  return apiRequest<TaskRead[]>("/labeler/tasks");
}

export function claimTask(taskId: string) {
  return apiRequest<ClaimRead>(`/labeler/tasks/${taskId}/claim`, { method: "POST" });
}

export function getAssignment(assignmentId: string) {
  return apiRequest<AssignmentDetailRead>(`/labeler/assignments/${assignmentId}`);
}

export async function getAssignmentWithTemplate(assignmentId: string): Promise<AssignmentLoadResult> {
  const assignment = await getAssignment(assignmentId);
  return { assignment, template: assignment.template_schema };
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

export function listOwnSubmissions() {
  return apiRequest<SubmissionRead[]>("/labeler/submissions");
}
