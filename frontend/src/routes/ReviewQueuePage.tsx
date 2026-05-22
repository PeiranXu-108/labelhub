import { Empty, Typography } from "antd";

export function ReviewQueuePage() {
  return (
    <main className="page-shell">
      <section className="workspace-panel" aria-labelledby="review-heading">
        <Typography.Title id="review-heading" level={1}>
          Review queue
        </Typography.Title>
        <Empty description="Human review queue APIs will be wired after workflow contracts land." />
      </section>
    </main>
  );
}
