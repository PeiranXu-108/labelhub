import { Button, Empty, Space, Typography } from "antd";

export function OwnerTasksPage() {
  return (
    <main className="page-shell">
      <section className="workspace-panel" aria-labelledby="owner-heading">
        <Space className="panel-toolbar" align="center">
          <Typography.Title id="owner-heading" level={1}>
            Owner tasks
          </Typography.Title>
          <Button type="primary" disabled>
            New task
          </Button>
        </Space>
        <Empty description="Task management APIs will be added by the backend workflow agent." />
      </section>
    </main>
  );
}
