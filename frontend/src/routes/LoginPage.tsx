import { Alert, Button, Form, Input, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { defaultRouteForRole, login } from "../features/auth/api";
import { setAccessToken } from "../features/auth/token";
import type { LoginCredentials, UserSummary } from "../features/auth/types";

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
    <main className="page-shell">
      <section className="form-panel" aria-labelledby="login-heading">
        <Typography.Title id="login-heading" level={1}>
          登录
        </Typography.Title>
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
    </main>
  );
}
