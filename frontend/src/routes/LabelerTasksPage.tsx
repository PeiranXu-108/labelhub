import { Empty, Typography } from "antd";

export function LabelerTasksPage() {
  return (
    <main className="page-shell">
      <section className="workspace-panel" aria-labelledby="labeler-heading">
        <Typography.Title id="labeler-heading" level={1}>
          Labeler tasks
        </Typography.Title>
        <Empty description="Claim and annotation workbench routes are reserved for downstream agents." />
      </section>
    </main>
  );
}
