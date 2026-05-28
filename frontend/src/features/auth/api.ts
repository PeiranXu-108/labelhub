import { apiRequest } from "./http";
import type { LoginCredentials, LoginResponse, UserRole, UserSummary } from "./types";

export function login(credentials: LoginCredentials) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: credentials,
    auth: false,
  });
}

export function getCurrentUser() {
  return apiRequest<UserSummary>("/auth/me");
}

export function defaultRouteForRole(role: UserRole) {
  switch (role) {
    case "owner":
      return "/owner/tasks";
    case "labeler":
      return "/labeler/tasks";
    case "reviewer":
      return "/review/queue";
    default:
      return "/login";
  }
}
