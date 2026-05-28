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
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="form-panel" aria-labelledby="login-heading">
        <Typography.Title id="login-heading" level={1}>
          Sign in
        </Typography.Title>
        {error ? <Alert className="section-alert" type="error" message={error} /> : null}
        <Form<LoginCredentials> layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Enter your email" },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input autoComplete="email" placeholder="owner@example.com" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Enter your password" }]}
          >
            <Input.Password autoComplete="current-password" placeholder="Password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            Sign in
          </Button>
        </Form>
      </section>
    </main>
  );
}
