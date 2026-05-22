import { Button, Form, Input, Typography } from "antd";

export function LoginPage() {
  return (
    <main className="page-shell">
      <section className="form-panel" aria-labelledby="login-heading">
        <Typography.Title id="login-heading" level={1}>
          Sign in
        </Typography.Title>
        <Form layout="vertical" disabled>
          <Form.Item label="Email">
            <Input placeholder="owner@example.com" />
          </Form.Item>
          <Form.Item label="Password">
            <Input.Password placeholder="Password" />
          </Form.Item>
          <Button type="primary">Continue</Button>
        </Form>
      </section>
    </main>
  );
}
