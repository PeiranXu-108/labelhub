import { Bubble, Prompts, Sender, ThoughtChain, Welcome } from "@ant-design/x/lib";
import type { PromptProps, ThoughtChainItem } from "@ant-design/x/lib";
import { Avatar, Button, Layout, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { UserSummary } from "../auth/types";
import { defaultAssistantPrompts } from "./assistant";
import type { StudioPrompt } from "./assistant";

export type StudioNavItem = {
  path: string;
  label: string;
};

type AppShellProps = {
  user?: UserSummary | null;
  navigationItems: StudioNavItem[];
  onLogout: () => void;
  children: ReactNode;
};

const roleLabels: Record<string, string> = {
  owner: "负责人",
  labeler: "标注员",
  reviewer: "审核员",
};

export function AppShell({ user, navigationItems, onLogout, children }: AppShellProps) {
  const location = useLocation();

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
        <nav className="app-nav studio-nav" aria-label="主导航">
          {navigationItems.map((item) => (
            <Link
              className={location.pathname.startsWith(item.path) ? "active" : undefined}
              key={item.path}
              to={item.path}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="auth-summary studio-auth-summary">
            <div className="user-chip" aria-label="当前用户">
              <Avatar size={28}>{user.name.slice(0, 1).toUpperCase()}</Avatar>
              <span>{user.name}</span>
              <Tag>{roleLabels[user.role] ?? user.role}</Tag>
            </div>
            <Button onClick={onLogout}>退出登录</Button>
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
};

export function StatusPill({ status, children }: { status: string; children: ReactNode }) {
  return <Tag color={statusTone[status] ?? "default"}>{children}</Tag>;
}

export function JsonViewer({ value, className }: { value: unknown; className?: string }) {
  return <pre className={["json-panel studio-json-viewer", className].filter(Boolean).join(" ")}>{JSON.stringify(value, null, 2)}</pre>;
}

type AssistantRailProps = {
  title?: string;
  description?: ReactNode;
  context?: ReactNode;
  prompts?: StudioPrompt[];
  facts?: Array<{ label: ReactNode; value: ReactNode }>;
  workflowItems?: ThoughtChainItem[];
  className?: string;
};

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export function AssistantRail({
  title = "LabelHub Assistant",
  description = "基于当前页面上下文的前端体验层，不会调用后端聊天接口。",
  context,
  prompts = defaultAssistantPrompts,
  facts = [],
  workflowItems,
  className,
}: AssistantRailProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content: "我会把当前任务、模板、AI 审核和导出状态整理成下一步建议。",
    },
  ]);

  const promptItems: PromptProps[] = useMemo(
    () =>
      prompts.map((prompt) => ({
        key: prompt.key,
        label: prompt.label,
        description: prompt.description,
      })),
    [prompts],
  );

  function appendExchange(userText: string, assistantText: string) {
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: userText },
      { id: `assistant-${Date.now()}`, role: "assistant", content: assistantText },
    ]);
  }

  function handlePrompt(key: string) {
    const prompt = prompts.find((item) => item.key === key);
    if (!prompt) {
      return;
    }
    appendExchange(prompt.label, prompt.response);
  }

  function handleSubmit(message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    appendExchange(trimmed, `已记录：“${trimmed}”。当前版本会在本地生成建议，后续可以接入真实助手 API。`);
    setDraft("");
  }

  return (
    <aside className={["assistant-rail", className].filter(Boolean).join(" ")} aria-label={title}>
      <Welcome
        className="assistant-welcome"
        title={title}
        description={description}
        icon={<span className="assistant-mark" aria-hidden="true" />}
      />
      {context ? <div className="assistant-context">{context}</div> : null}
      {facts.length > 0 ? (
        <div className="assistant-facts">
          {facts.map((fact, index) => (
            <div key={index}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {workflowItems && workflowItems.length > 0 ? (
        <ThoughtChain className="assistant-thought-chain" items={workflowItems} size="small" />
      ) : null}
      <Prompts
        className="assistant-prompts"
        items={promptItems}
        title="建议操作"
        vertical
        onItemClick={({ data }) => handlePrompt(data.key)}
      />
      <Bubble.List
        className="assistant-bubbles"
        items={messages.map((message) => ({
          key: message.id,
          role: message.role,
          content: message.content,
        }))}
        roles={{
          assistant: {
            avatar: { children: "AI" },
            placement: "start",
            variant: "shadow",
          },
          user: {
            avatar: { children: "我" },
            placement: "end",
            variant: "filled",
          },
        }}
      />
      <Sender
        autoSize={{ minRows: 1, maxRows: 3 }}
        className="assistant-sender"
        placeholder="输入一个本地助手问题"
        submitType="enter"
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
      />
      <Space className="assistant-note">
        <span />
        <Typography.Text type="secondary">本地交互</Typography.Text>
      </Space>
    </aside>
  );
}
