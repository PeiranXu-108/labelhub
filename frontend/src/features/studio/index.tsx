import { Alert, Avatar, Button, Layout, Popover, Spin, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { UserSummary } from "../auth/types";
import { listMarketplaceTasks, listOwnSubmissions } from "../labeler/api";
import { listTasks } from "../owner/api";
import { listAIOperationRuns } from "../agent-workflow/api";
import { listReviewQueue } from "../reviewer/api";

type RouteNavItem = {
  label: string;
  path?: string;
};

type AppShellProps = {
  user?: UserSummary | null;
  onLogout: () => void;
  children: ReactNode;
};

type AccountDashboardMetric = {
  label: string;
  value: number;
};

type AccountDashboardState =
  | { status: "idle" | "loading"; metrics: AccountDashboardMetric[] }
  | { status: "ready"; metrics: AccountDashboardMetric[] }
  | { status: "error"; metrics: AccountDashboardMetric[]; message: string };

const roleLabels: Record<string, string> = {
  owner: "负责人",
  labeler: "标注员",
  reviewer: "审核员",
};

function getRouteNavigation(pathname: string): RouteNavItem[] {
  if (pathname === "/") {
    return [];
  }
  if (pathname === "/login") {
    return [{ label: "首页", path: "/" }, { label: "登录" }];
  }
  if (pathname === "/owner/tasks") {
    return [{ label: "首页", path: "/" }, { label: "任务列表" }];
  }
  if (pathname === "/ai-operations") {
    return [{ label: "首页", path: "/" }, { label: "AI 预审运维" }];
  }
  if (pathname.startsWith("/ai-operations/runs/")) {
    return [{ label: "首页", path: "/" }, { label: "AI 预审运维", path: "/ai-operations" }, { label: "运行详情" }];
  }
  if (pathname.startsWith("/owner/tasks/")) {
    return [{ label: "首页", path: "/" }, { label: "任务列表", path: "/owner/tasks" }, { label: "任务详情" }];
  }
  if (pathname === "/labeler/tasks") {
    return [{ label: "首页", path: "/" }, { label: "标注任务" }];
  }
  if (pathname.startsWith("/labeler/assignments/")) {
    return [{ label: "首页", path: "/" }, { label: "标注任务", path: "/labeler/tasks" }, { label: "标注详情" }];
  }
  if (pathname === "/review/queue") {
    return [{ label: "首页", path: "/" }, { label: "审核队列" }];
  }
  if (pathname.startsWith("/review/submissions/")) {
    return [{ label: "首页", path: "/" }, { label: "审核队列", path: "/review/queue" }, { label: "提交详情" }];
  }
  return [{ label: "首页", path: "/" }, { label: "当前页面" }];
}

const roleEntryPath: Record<string, string> = {
  owner: "/owner/tasks",
  labeler: "/labeler/tasks",
  reviewer: "/review/queue",
};

async function loadAccountMetrics(user: UserSummary): Promise<AccountDashboardMetric[]> {
  if (user.role === "owner") {
    const tasks = await listTasks();
    return [
      { label: "任务总数", value: tasks.length },
      { label: "已发布", value: tasks.filter((task) => task.status === "published").length },
      { label: "待配置", value: tasks.filter((task) => task.status === "draft" || task.status === "paused").length },
      { label: "已结束", value: tasks.filter((task) => task.status === "ended").length },
    ];
  }

  if (user.role === "labeler") {
    const [tasks, submissions] = await Promise.all([listMarketplaceTasks(), listOwnSubmissions()]);
    return [
      { label: "可认领", value: tasks.length },
      { label: "我的提交", value: submissions.length },
      { label: "待修订", value: submissions.filter((submission) => submission.status === "returned" || submission.status === "ai_returned").length },
      { label: "已通过", value: submissions.filter((submission) => submission.status === "approved" || submission.status === "exportable").length },
    ];
  }

  if (user.role === "reviewer") {
    const [queueItems, aiRuns] = await Promise.all([listReviewQueue(), listAIOperationRuns({ run_status: "failed" })]);
    return [
      { label: "队列总数", value: queueItems.length },
      { label: "待人工", value: queueItems.filter((item) => item.submission.status === "needs_human_review").length },
      { label: "AI 通过", value: queueItems.filter((item) => item.submission.status === "ai_passed").length },
      { label: "AI 失败", value: aiRuns.length },
    ];
  }

  return [];
}

function AccountDashboard({
  user,
  state,
  onRetry,
  onLogout,
}: {
  user: UserSummary;
  state: AccountDashboardState;
  onRetry: () => void;
  onLogout: () => void;
}) {
  const roleLabel = roleLabels[user.role] ?? user.role;
  const entryPath = roleEntryPath[user.role] ?? "/";

  return (
    <section className="account-dashboard-popover" aria-label="账号工作内容看板">
      <div className="account-dashboard-identity">
        <Avatar size={40}>{user.name.slice(0, 1).toUpperCase()}</Avatar>
        <div>
          <Typography.Text strong>{user.name}</Typography.Text>
          <Typography.Text type="secondary">{user.email}</Typography.Text>
        </div>
        <Tag>{roleLabel}</Tag>
      </div>
      {state.status === "loading" || state.status === "idle" ? (
        <div className="account-dashboard-loading">
          <Spin size="small" />
          <Typography.Text type="secondary">加载工作内容</Typography.Text>
        </div>
      ) : null}
      {state.status === "error" ? (
        <Alert
          action={
            <Button size="small" onClick={onRetry}>
              重试
            </Button>
          }
          message={state.message}
          type="error"
        />
      ) : null}
      {state.status === "ready" ? (
        <div className="account-dashboard-metrics">
          {state.metrics.map((metric) => (
            <div className="account-dashboard-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <div className="account-dashboard-actions">
        <Link className="account-dashboard-entry" to={entryPath}>
          进入工作台
        </Link>
        <Button onClick={onLogout}>退出登录</Button>
      </div>
    </section>
  );
}

export function AppShell({ user, onLogout, children }: AppShellProps) {
  const location = useLocation();
  const routeNavigation = getRouteNavigation(location.pathname);
  const [accountOpen, setAccountOpen] = useState(false);
  const [dashboardState, setDashboardState] = useState<AccountDashboardState>({ status: "idle", metrics: [] });

  useEffect(() => {
    setAccountOpen(false);
    setDashboardState({ status: "idle", metrics: [] });
  }, [user?.id, user?.role]);

  const loadDashboard = useCallback(async () => {
    if (!user) {
      return;
    }
    setDashboardState({ status: "loading", metrics: [] });
    try {
      setDashboardState({ status: "ready", metrics: await loadAccountMetrics(user) });
    } catch {
      setDashboardState({ status: "error", metrics: [], message: "看板加载失败" });
    }
  }, [user]);

  function handleAccountOpenChange(open: boolean) {
    setAccountOpen(open);
    if (open && dashboardState.status === "idle") {
      void loadDashboard();
    }
  }

  return (
    <Layout className="app-layout studio-app">
      <Layout.Header className="app-header studio-app-header">
        <Link className="brand studio-brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            LH
          </span>
          <span className="brand-copy">
            <span>LabelHub</span>
            <small>Studio</small>
          </span>
        </Link>
        {routeNavigation.length > 0 ? (
          <nav className="route-nav" aria-label="路由导航">
            <div className="route-nav-inner">
              {routeNavigation.map((item, index) => (
                <span className="route-nav-item" key={`${item.label}-${index}`}>
                  {item.path ? <Link to={item.path}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
                </span>
              ))}
            </div>
          </nav>
        ) : null}
        {user ? (
          <div className="auth-summary studio-auth-summary">
            <Popover
              arrow={false}
              content={<AccountDashboard state={dashboardState} user={user} onLogout={onLogout} onRetry={loadDashboard} />}
              open={accountOpen}
              placement="bottomRight"
              trigger="click"
              onOpenChange={handleAccountOpenChange}
            >
              <button className="user-chip account-trigger" aria-label="当前用户" type="button">
                <Avatar size={28}>{user.name.slice(0, 1).toUpperCase()}</Avatar>
                <span className="user-chip-name">{user.name}</span>
                <Tag>{roleLabels[user.role] ?? user.role}</Tag>
              </button>
            </Popover>
          </div>
        ) : null}
      </Layout.Header>
      <Layout.Content className="studio-content">{children}</Layout.Content>
    </Layout>
  );
}

type StudioPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  backLink?: ReactNode;
};

export function StudioPageHeader({ title, description, actions, meta, backLink }: StudioPageHeaderProps) {
  return (
    <div className="studio-page-header">
      <div className="studio-page-copy">
        {backLink ? <div className="studio-back-link">{backLink}</div> : null}
        <Typography.Title level={1}>{title}</Typography.Title>
        {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
        {meta ? <div className="studio-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="studio-page-actions">{actions}</div> : null}
    </div>
  );
}

type StudioPanelProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function StudioPanel({ title, description, actions, className, children }: StudioPanelProps) {
  return (
    <section className={["studio-panel", className].filter(Boolean).join(" ")}>
      {title || description || actions ? (
        <div className="studio-panel-header">
          <div>
            {title ? <Typography.Title level={3}>{title}</Typography.Title> : null}
            {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
          </div>
          {actions ? <div className="studio-panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type MetricStripProps = {
  items: Array<{
    label: ReactNode;
    value: ReactNode;
    detail?: ReactNode;
    tone?: "neutral" | "good" | "warning" | "danger" | "accent";
  }>;
};

export function MetricStrip({ items }: MetricStripProps) {
  return (
    <div className="metric-strip">
      {items.map((item, index) => (
        <div className={`metric-card tone-${item.tone ?? "neutral"}`} key={index}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}

const statusTone: Record<string, string> = {
  draft: "default",
  published: "green",
  paused: "gold",
  ended: "red",
  approved: "green",
  returned: "red",
  ai_returned: "red",
  ai_passed: "green",
  needs_human_review: "blue",
  human_reviewing: "blue",
  submitted: "blue",
  complete: "green",
  active: "blue",
  failed: "red",
  pending: "default",
  passed: "green",
};

export function StatusPill({ status, children }: { status: string; children: ReactNode }) {
  return <Tag color={statusTone[status] ?? "default"}>{children}</Tag>;
}

export function JsonViewer({ value, className }: { value: unknown; className?: string }) {
  return <pre className={["json-panel studio-json-viewer", className].filter(Boolean).join(" ")}>{JSON.stringify(value, null, 2)}</pre>;
}
