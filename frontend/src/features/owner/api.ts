import type {
  ExportCreate,
  ExportJobRead,
  ItemImportEntry,
  ReviewConfig,
  TaskCreate,
  TaskItemRead,
  TaskRead,
  TaskUpdate,
  TemplateSchemaRead,
} from "./types";
import { apiRequest, fetchWithAuth, readError } from "../auth/http";

export type DownloadedFile = {
  blob: Blob;
  filename: string;
};

export function listTasks() {
  return apiRequest<TaskRead[]>("/tasks");
}

export function createTask(payload: TaskCreate) {
  return apiRequest<TaskRead>("/tasks", { method: "POST", body: payload });
}

export function updateTask(taskId: string, payload: TaskUpdate) {
  return apiRequest<TaskRead>(`/tasks/${taskId}`, { method: "PATCH", body: payload });
}

export function transitionTask(taskId: string, action: "publish" | "pause" | "end") {
  return apiRequest<TaskRead>(`/tasks/${taskId}/${action}`, { method: "POST" });
}

export function getTask(taskId: string) {
  return apiRequest<TaskRead>(`/tasks/${taskId}`);
}

export function listItems(taskId: string) {
  return apiRequest<TaskItemRead[]>(`/tasks/${taskId}/items`);
}

export function importItems(taskId: string, items: ItemImportEntry[]) {
  return apiRequest<TaskItemRead[]>(`/tasks/${taskId}/items/import`, {
    method: "POST",
    body: { items },
  });
}

export function getReviewConfig(taskId: string) {
  return apiRequest<ReviewConfig>(`/tasks/${taskId}/review-config`);
}

export function saveReviewConfig(taskId: string, payload: ReviewConfig) {
  const { id: _id, task_id: _taskId, created_at: _createdAt, updated_at: _updatedAt, ...body } = payload;
  return apiRequest<ReviewConfig>(`/tasks/${taskId}/review-config`, {
    method: "PUT",
    body,
  });
}

export function getTemplate(taskId: string) {
  return apiRequest<TemplateSchemaRead>(`/tasks/${taskId}/template`);
}

export function saveTemplateDraft(taskId: string, schema: TemplateSchemaRead["schema_payload"]) {
  return apiRequest<TemplateSchemaRead>(`/tasks/${taskId}/template/draft`, {
    method: "POST",
    body: { schema },
  });
}

export function publishTemplate(taskId: string) {
  return apiRequest<TemplateSchemaRead>(`/tasks/${taskId}/template/publish`, { method: "POST" });
}

export function listExportJobs(taskId: string) {
  return apiRequest<ExportJobRead[]>(`/tasks/${taskId}/exports`);
}

export function createExportJob(taskId: string, payload: ExportCreate) {
  return apiRequest<ExportJobRead>(`/tasks/${taskId}/exports`, { method: "POST", body: payload });
}

export async function downloadExportJob(exportJobId: string): Promise<DownloadedFile> {
  const response = await fetchWithAuth(`/exports/${exportJobId}/download`, { method: "GET" });
  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail);
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get("Content-Disposition")) ?? `export-${exportJobId}`,
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
