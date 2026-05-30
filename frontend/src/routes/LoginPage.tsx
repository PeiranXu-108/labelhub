import { Alert, Button, Form, Input, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { defaultRouteForRole, login } from "../features/auth/api";
import { setAccessToken } from "../features/auth/token";
import type { LoginCredentials, UserSummary } from "../features/auth/types";
import { MetricStrip } from "../features/studio";

type LoginPageProps = {
  currentUser?: UserSummary | null;
  onAuthenticated?: (user: UserSummary) => void;
};

export function LoginPage({ currentUser, onAuthenticated }: LoginPageProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentUser) {
      navigate(defaultRouteForRole(currentUser.role), { replace: true });
    }
  }, [currentUser, navigate]);

  async function handleSubmit(values: LoginCredentials) {
    setError(null);
    setSubmitting(true);
    try {
      const response = await login(values);
      setAccessToken(response.access_token);
      onAuthenticated?.(response.user);
      navigate(defaultRouteForRole(response.user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法登录");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell login-shell">
      <section className="login-product-frame">
        <aside className="login-copy" aria-label="产品说明">
          <Typography.Title level={1}>LabelHub Studio</Typography.Title>
          <Typography.Paragraph>
            面向数据标注生产的协作工作台，让任务运营、结构化标注、AI 分流和人工审核保持在同一条清晰链路里。
          </Typography.Paragraph>
          <MetricStrip
            items={[
              { label: "负责人", value: "任务模板" },
              { label: "标注员", value: "认领提交" },
              { label: "审核员", value: "AI 复核" },
            ]}
          />
          <div className="login-role-list" aria-label="角色能力">
            <div>
              <strong>发布任务</strong>
              <span>导入数据、维护模板、设置审核标准。</span>
            </div>
            <div>
              <strong>完成标注</strong>
              <span>在工作台内查看原始数据并提交结构化答案。</span>
            </div>
            <div>
              <strong>复核交付</strong>
              <span>结合 AI 决策、审计时间线和导出状态完成验收。</span>
            </div>
          </div>
        </aside>
        <section className="login-panel-column" aria-label="登录区域">
          <section className="form-panel login-panel" aria-labelledby="login-heading">
            <div className="login-panel-heading">
              <Typography.Text type="secondary">欢迎回来</Typography.Text>
              <Typography.Title id="login-heading" level={1}>
                登录
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                使用你的 LabelHub 账号继续当前角色的工作流。
              </Typography.Paragraph>
            </div>
            {error ? <Alert className="section-alert" type="error" message={error} /> : null}
            <Form<LoginCredentials> layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                label="邮箱"
                name="email"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "请输入有效邮箱" },
                ]}
              >
                <Input autoComplete="email" placeholder="owner@example.com" />
              </Form.Item>
              <Form.Item
                label="密码"
                name="password"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password autoComplete="current-password" placeholder="密码" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={submitting}>
                登录
              </Button>
            </Form>
          </section>
        </section>
      </section>
    </main>
  );
}
