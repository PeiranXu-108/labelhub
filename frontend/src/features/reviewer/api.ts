import { apiRequest, fetchWithAuth, readError } from "../auth/http";
import type { SubmissionRead } from "../labeler/types";
import type { ReviewStage } from "../labeler/types";
import type {
  AuditLogRead,
  ReviewQueueFilters,
  ReviewQueueItemRead,
  ReviewerMetricsRead,
  ReviewSubmissionDetail,
} from "./types";

export type DownloadedReviewAuditFile = {
  blob: Blob;
  filename: string;
};

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

export function getReviewerMetrics() {
  return apiRequest<ReviewerMetricsRead>("/review/metrics");
}

export function getReviewSubmission(submissionId: string) {
  return apiRequest<ReviewSubmissionDetail>(`/review/submissions/${submissionId}`);
}

export function approveSubmission(submissionId: string, stage: ReviewStage = "final_review") {
  return apiRequest<SubmissionRead>(`/review/submissions/${submissionId}/approve`, {
    method: "POST",
    body: { stage },
  });
}

export function returnSubmission(submissionId: string, reason: string, stage?: ReviewStage | null) {
  return apiRequest<SubmissionRead>(`/review/submissions/${submissionId}/return`, {
    method: "POST",
    body: { reason, stage },
  });
}

export function batchReview(
  submissionIds: string[],
  action: "approve" | "return",
  reason?: string,
  stage?: ReviewStage | null,
) {
  return apiRequest<SubmissionRead[]>("/review/submissions/batch", {
    method: "POST",
    body: { submission_ids: submissionIds, action, reason, stage },
  });
}

export function listSubmissionAudit(submissionId: string) {
  const query = new URLSearchParams({ entity_type: "submission", entity_id: submissionId });
  return apiRequest<AuditLogRead[]>(`/audit?${query.toString()}`);
}

export function downloadSubmissionAuditExport(submissionId: string) {
  return downloadReviewAuditExport(
    `/review/submissions/${submissionId}/audit-export`,
    `review-audit-submission-${submissionId}.json`,
  );
}

export function downloadTaskAuditExport(taskId: string) {
  return downloadReviewAuditExport(
    `/review/tasks/${taskId}/audit-export`,
    `review-audit-task-${taskId}.json`,
  );
}

export function saveReviewAuditFile(file: DownloadedReviewAuditFile) {
  const objectUrl = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function downloadReviewAuditExport(path: string, fallbackFilename: string): Promise<DownloadedReviewAuditFile> {
  const response = await fetchWithAuth(path, { method: "GET" });
  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail);
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get("Content-Disposition")) ?? fallbackFilename,
  };
}

function parseFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }
  const filenameMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition);
  if (!filenameMatch) {
    return null;
  }
  return decodeURIComponent(filenameMatch[1].replace(/"$/, ""));
}
