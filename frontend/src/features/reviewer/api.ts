import { apiRequest } from "../auth/http";
import type { SubmissionRead } from "../labeler/types";
import type {
  AuditLogRead,
  ReviewQueueFilters,
  ReviewQueueItemRead,
  ReviewSubmissionDetail,
} from "./types";

export function listReviewQueue(filters: ReviewQueueFilters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<ReviewQueueItemRead[]>(`/review/queue${suffix}`);
}

export function getReviewSubmission(submissionId: string) {
  return apiRequest<ReviewSubmissionDetail>(`/review/submissions/${submissionId}`);
}

export function approveSubmission(submissionId: string) {
  return apiRequest<SubmissionRead>(`/review/submissions/${submissionId}/approve`, {
    method: "POST",
  });
}

export function returnSubmission(submissionId: string, reason: string) {
  return apiRequest<SubmissionRead>(`/review/submissions/${submissionId}/return`, {
    method: "POST",
    body: { reason },
  });
}

export function batchReview(submissionIds: string[], action: "approve" | "return", reason?: string) {
  return apiRequest<SubmissionRead[]>("/review/submissions/batch", {
    method: "POST",
    body: { submission_ids: submissionIds, action, reason },
  });
}

export function listSubmissionAudit(submissionId: string) {
  const query = new URLSearchParams({ entity_type: "submission", entity_id: submissionId });
  return apiRequest<AuditLogRead[]>(`/audit?${query.toString()}`);
}
