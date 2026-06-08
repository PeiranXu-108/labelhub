import { apiRequest } from "../auth/http";
import type {
  AIOperationRetryResponse,
  AIOperationRunDetailRead,
  AIOperationRunFilters,
  AIOperationRunListItemRead,
} from "./aiOperationsTypes";

export function listAIOperationRuns(filters: AIOperationRunFilters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AIOperationRunListItemRead[]>(`/ai-operations/runs${suffix}`);
}

export function getAIOperationRun(submissionId: string) {
  return apiRequest<AIOperationRunDetailRead>(`/ai-operations/runs/${submissionId}`);
}

export function retryAIOperationRun(submissionId: string) {
  return apiRequest<AIOperationRetryResponse>(`/ai-operations/runs/${submissionId}/retry`, {
    method: "POST",
  });
}
