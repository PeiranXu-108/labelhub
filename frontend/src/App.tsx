import { XProvider } from "@ant-design/x/lib";
import { App as AntdApp, Button, ConfigProvider, Space, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { defaultRouteForRole, getCurrentUser } from "./features/auth/api";
import { clearAccessToken, getAccessToken } from "./features/auth/token";
import type { UserRole, UserSummary } from "./features/auth/types";
import { LoginPage } from "./routes/LoginPage";
import { AIOperationDetailRoute } from "./routes/ai-operations/AIOperationDetailRoute";
import { AIOperationsRoute } from "./routes/ai-operations/AIOperationsRoute";
import { LabelerAssignmentRoute } from "./routes/labeler/LabelerAssignmentRoute";
import { LabelerTasksRoute } from "./routes/labeler/LabelerTasksRoute";
import { OwnerTaskDetailRoute } from "./routes/owner/OwnerTaskDetailRoute";
import { OwnerTasksRoute } from "./routes/owner/OwnerTasksRoute";
import { ReviewQueueRoute } from "./routes/review/ReviewQueueRoute";
import { ReviewSubmissionRoute } from "./routes/review/ReviewSubmissionRoute";
import { AppShell, MetricStrip, StudioPanel } from "./features/studio";
import { defaultAssistantPrompts } from "./features/studio/assistant";

type AuthState =
  | { status: "checking"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: UserSummary };

function HomePage() {
  return (
    <main className="page-shell studio-home-shell">
      <section className="home-hero">
        <div className="home-hero-copy">
          <Typography.Title level={1}>LabelHub Studio</Typography.Title>
          <Typography.Paragraph>
            把任务创建、数据标注、AI 审核、人工审核和数据导出放进一个更安静、更聪明的生产工作台。
          </Typography.Paragraph>
          <div className="home-intent-box" aria-label="LabelHub 意图入口">
            <span>今天想先完成什么？</span>
            <div className="home-prompt-actions">
              {defaultAssistantPrompts.map((prompt) => (
                <Button key={prompt.key}>{prompt.label}</Button>
              ))}
            </div>
          </div>
          <MetricStrip
            items={[
              { label: "工作流", value: "5 步", detail: "创建到导出", tone: "accent" },
              { label: "审核方式", value: "AI + 人工", detail: "分流复核", tone: "good" },
              { label: "交付物", value: "CSV / JSONL", detail: "可追溯导出" },
            ]}
          />
        </div>
      </section>
      <div className="home-panel-grid">
        <StudioPanel title="负责人" description="创建任务、导入数据、发布模板，并跟踪 Agent 审核产线。">
          <Space wrap>
            <Button type="primary" href="/owner/tasks">
              进入任务运营
            </Button>
            <Button href="/login">登录</Button>
          </Space>
        </StudioPanel>
        <StudioPanel title="标注员" description="认领任务、填写结构化答案，并通过自动保存减少重复劳动。">
          <Typography.Text type="secondary">工作台将原始数据、模板字段和助手建议并排呈现。</Typography.Text>
        </StudioPanel>
        <StudioPanel title="审核员" description="用 AI 分数、审计轨迹和人工决策面板更快完成复核。">
          <Typography.Text type="secondary">批量通过、退回原因和历史尝试保留原有接口契约。</Typography.Text>
        </StudioPanel>
      </div>
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
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 10,
          colorBgBase: "#f7f6f2",
          colorPrimary: "#181816",
          colorText: "#191816",
          colorTextSecondary: "#6d675e",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        },
      }}
    >
      <XProvider>
        <AntdApp message={{ duration: 4, maxCount: 3, top: 76 }}>
          <AppShell user={authState.user} onLogout={handleLogout}>
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
                path="/ai-operations"
                element={
                  <RequireRole authState={authState} roles={["owner", "reviewer"]}>
                    <AIOperationsRoute />
                  </RequireRole>
                }
              />
              <Route
                path="/ai-operations/runs/:submissionId"
                element={
                  <RequireRole authState={authState} roles={["owner", "reviewer"]}>
                    <AIOperationDetailRoute />
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
          </AppShell>
        </AntdApp>
      </XProvider>
    </ConfigProvider>
  );
}
