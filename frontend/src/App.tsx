import { Button, Layout, Spin, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { defaultRouteForRole, getCurrentUser } from "./features/auth/api";
import { clearAccessToken, getAccessToken } from "./features/auth/token";
import type { UserRole, UserSummary } from "./features/auth/types";
import { LoginPage } from "./routes/LoginPage";
import { LabelerAssignmentRoute } from "./routes/labeler/LabelerAssignmentRoute";
import { LabelerTasksRoute } from "./routes/labeler/LabelerTasksRoute";
import { OwnerTaskDetailRoute } from "./routes/owner/OwnerTaskDetailRoute";
import { OwnerTasksRoute } from "./routes/owner/OwnerTasksRoute";
import { ReviewQueueRoute } from "./routes/review/ReviewQueueRoute";
import { ReviewSubmissionRoute } from "./routes/review/ReviewSubmissionRoute";

type AuthState =
  | { status: "checking"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: UserSummary };

const navigationByRole: Partial<Record<UserRole, { path: string; label: string }[]>> = {
  owner: [{ path: "/owner/tasks", label: "Owner" }],
  labeler: [{ path: "/labeler/tasks", label: "Labeler" }],
  reviewer: [{ path: "/review/queue", label: "Review" }],
};

function HomePage() {
  return (
    <main className="page-shell">
      <section className="intro-panel">
        <Typography.Title level={1}>LabelHub</Typography.Title>
        <Typography.Paragraph>
          Foundation scaffold for task creation, annotation, AI review, human review,
          and export workflows.
        </Typography.Paragraph>
      </section>
    </main>
  );
}

function AuthLoading() {
  return (
    <main className="page-shell auth-loading">
      <Spin />
    </main>
  );
}

function RequireRole({
  authState,
  children,
  roles,
}: {
  authState: AuthState;
  children: ReactElement;
  roles: UserRole[];
}) {
  const location = useLocation();

  if (authState.status === "checking") {
    return <AuthLoading />;
  }
  if (!authState.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(authState.user.role)) {
    return <Navigate to={defaultRouteForRole(authState.user.role)} replace />;
  }
  return children;
}

export default function App() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>(() =>
    getAccessToken() ? { status: "checking", user: null } : { status: "anonymous", user: null },
  );
  const navigationItems = useMemo(
    () => (authState.user ? (navigationByRole[authState.user.role] ?? []) : []),
    [authState.user],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      setAuthState({ status: "anonymous", user: null });
      return;
    }

    let active = true;
    getCurrentUser()
      .then((user) => {
        if (active) {
          setAuthState({ status: "authenticated", user });
        }
      })
      .catch(() => {
        clearAccessToken();
        if (active) {
          setAuthState({ status: "anonymous", user: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function handleAuthenticated(user: UserSummary) {
    setAuthState({ status: "authenticated", user });
  }

  function handleLogout() {
    clearAccessToken();
    setAuthState({ status: "anonymous", user: null });
    navigate("/login", { replace: true });
  }

  return (
    <Layout className="app-layout">
      <Layout.Header className="app-header">
        <Link className="brand" to="/">
          LabelHub
        </Link>
        <nav className="app-nav" aria-label="Primary">
          {navigationItems.map((item) => (
            <Link key={item.path} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>
        {authState.user ? (
          <div className="auth-summary">
            <span>{authState.user.name}</span>
            <Button onClick={handleLogout}>Log out</Button>
          </div>
        ) : null}
      </Layout.Header>
      <Layout.Content>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/login"
            element={<LoginPage currentUser={authState.user} onAuthenticated={handleAuthenticated} />}
          />
          <Route
            path="/owner/tasks"
            element={
              <RequireRole authState={authState} roles={["owner"]}>
                <OwnerTasksRoute />
              </RequireRole>
            }
          />
          <Route
            path="/owner/tasks/:taskId"
            element={
              <RequireRole authState={authState} roles={["owner"]}>
                <OwnerTaskDetailRoute />
              </RequireRole>
            }
          />
          <Route
            path="/labeler/tasks"
            element={
              <RequireRole authState={authState} roles={["labeler"]}>
                <LabelerTasksRoute />
              </RequireRole>
            }
          />
          <Route
            path="/labeler/assignments/:assignmentId"
            element={
              <RequireRole authState={authState} roles={["labeler"]}>
                <LabelerAssignmentRoute />
              </RequireRole>
            }
          />
          <Route
            path="/review/queue"
            element={
              <RequireRole authState={authState} roles={["reviewer"]}>
                <ReviewQueueRoute />
              </RequireRole>
            }
          />
          <Route
            path="/review/submissions/:submissionId"
            element={
              <RequireRole authState={authState} roles={["reviewer"]}>
                <ReviewSubmissionRoute />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout.Content>
    </Layout>
  );
}
