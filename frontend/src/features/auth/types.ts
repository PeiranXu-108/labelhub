export type UserRole = "owner" | "labeler" | "reviewer" | "ai_agent";

export type UserSummary = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  user: UserSummary;
};
