import { getAccessToken } from "./token";

export const API_BASE_URL =
  (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? "";

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

type FetchOptions = {
  method: string;
  body?: string;
  json?: boolean;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetchWithAuth(path, {
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    json: options.body !== undefined,
    auth: options.auth,
  });

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchWithAuth(path: string, options: FetchOptions) {
  const token = options.auth === false ? null : getAccessToken();
  const headers: Record<string, string> = {
    Accept: options.json ? "application/json" : "*/*",
  };
  if (options.json) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body,
  });
}

export async function readError(response: Response) {
  try {
    const payload = await response.json();
    if (payload?.detail?.message) {
      return payload.detail.message as string;
    }
    if (payload?.detail?.code) {
      return payload.detail.code as string;
    }
  } catch {
    return `${response.status} ${response.statusText}`;
  }
  return `${response.status} ${response.statusText}`;
}
