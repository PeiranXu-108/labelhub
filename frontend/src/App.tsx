import { Layout, Typography } from "antd";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "./routes/LoginPage";
import { LabelerAssignmentRoute } from "./routes/labeler/LabelerAssignmentRoute";
import { LabelerTasksRoute } from "./routes/labeler/LabelerTasksRoute";
import { OwnerTaskDetailRoute } from "./routes/owner/OwnerTaskDetailRoute";
import { OwnerTasksRoute } from "./routes/owner/OwnerTasksRoute";
import { ReviewQueueRoute } from "./routes/review/ReviewQueueRoute";
import { ReviewSubmissionRoute } from "./routes/review/ReviewSubmissionRoute";

const navigationItems = [
  { path: "/owner/tasks", label: "Owner" },
  { path: "/labeler/tasks", label: "Labeler" },
  { path: "/review/queue", label: "Review" },
];

function HomePage() {
  return (
    <main className="page-shell">
      <section className="intro-panel">
        <Typography.Title level={1}>LabelHub</Typography.Title>
        <Typography.Paragraph>
          Foundation scaffold for task creation, annotation, AI review, human review,
          and export workflows.
        </Typography.Paragraph>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <Layout className="app-layout">
      <Layout.Header className="app-header">
        <Link className="brand" to="/">
          LabelHub
        </Link>
        <nav className="app-nav" aria-label="Primary">
          {navigationItems.map((item) => (
            <Link key={item.path} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>
      </Layout.Header>
      <Layout.Content>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/owner/tasks" element={<OwnerTasksRoute />} />
          <Route path="/owner/tasks/:taskId" element={<OwnerTaskDetailRoute />} />
          <Route path="/labeler/tasks" element={<LabelerTasksRoute />} />
          <Route path="/labeler/assignments/:assignmentId" element={<LabelerAssignmentRoute />} />
          <Route path="/review/queue" element={<ReviewQueueRoute />} />
          <Route path="/review/submissions/:submissionId" element={<ReviewSubmissionRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout.Content>
    </Layout>
  );
}
