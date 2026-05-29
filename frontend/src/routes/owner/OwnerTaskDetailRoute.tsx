import { Alert, Button, Skeleton, Space, Tabs, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ExportCenter } from "../../features/export/ExportCenter";
import type { TaskAgentWorkflowSummaryRead } from "../../features/agent-workflow/types";
import { DatasetImportPanel } from "../../features/owner/DatasetImportPanel";
import {
  getReviewConfig,
  getTask,
  getTaskAgentWorkflow,
  getTemplate,
  listExportJobs,
  listItems,
} from "../../features/owner/api";
import { ReviewConfigEditor } from "../../features/owner/ReviewConfigEditor";
import { TaskDashboard } from "../../features/owner/TaskDashboard";
import { TemplateWorkspace } from "../../features/owner/TemplateWorkspace";
import type {
  ExportJobRead,
  ReviewConfig,
  TaskItemRead,
  TaskRead,
  TemplateSchemaRead,
} from "../../features/owner/types";

const defaultReviewConfig: ReviewConfig = {
  prompt_template: "",
  criteria: [],
  pass_threshold: 80,
  return_threshold: 40,
  manual_review_threshold: 60,
  model_name: "deepseek-chat",
  temperature: 0,
  max_retries: 2,
};

export function OwnerTaskDetailRoute() {
  const { taskId } = useParams();
  const [task, setTask] = useState<TaskRead | null>(null);
  const [items, setItems] = useState<TaskItemRead[]>([]);
  const [config, setConfig] = useState<ReviewConfig>(defaultReviewConfig);
  const [template, setTemplate] = useState<TemplateSchemaRead | null>(null);
  const [exports, setExports] = useState<ExportJobRead[]>([]);
  const [agentWorkflow, setAgentWorkflow] = useState<TaskAgentWorkflowSummaryRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!taskId) {
      setError("Task id is missing from the route.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [taskResult, itemResult, configResult, templateResult, exportResult, workflowResult] = await Promise.all([
        getTask(taskId),
        listItems(taskId),
        getReviewConfig(taskId).catch(() => defaultReviewConfig),
        getTemplate(taskId).catch(() => null),
        listExportJobs(taskId).catch(() => []),
        getTaskAgentWorkflow(taskId).catch(() => null),
      ]);
      setTask(taskResult);
      setItems(itemResult);
      setConfig(configResult);
      setTemplate(templateResult);
      setExports(exportResult);
      setAgentWorkflow(workflowResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task operations.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!taskId) {
    return (
      <main className="page-shell owner-shell">
        <Alert message="Task id is missing from the route." type="error" />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page-shell owner-shell">
        <Skeleton active paragraph={{ rows: 8 }} />
      </main>
    );
  }

  if (error || !task) {
    return (
      <main className="page-shell owner-shell">
        <Alert
          action={<Button onClick={load}>Retry</Button>}
          message={error ?? "Task not found."}
          type="error"
        />
      </main>
    );
  }

  return (
    <main className="page-shell owner-shell">
      <section className="owner-section">
        <Space direction="vertical" size={4}>
          <Link to="/owner/tasks">Back to tasks</Link>
          <Typography.Title level={1}>{task.name}</Typography.Title>
          <Typography.Text type="secondary">{task.description || "No description"}</Typography.Text>
        </Space>
        <Tabs
          className="owner-tabs"
          items={[
            {
              key: "dashboard",
              label: "Dashboard",
              children: (
                <TaskDashboard
                  agentWorkflow={agentWorkflow}
                  exports={exports}
                  items={items}
                  task={task}
                  template={template}
                />
              ),
            },
            {
              key: "dataset",
              label: "Dataset",
              children: (
                <DatasetImportPanel
                  taskId={taskId}
                  onImported={(imported) => setItems((current) => [...imported, ...current])}
                />
              ),
            },
            {
              key: "template",
              label: "Template",
              children: <TemplateWorkspace taskId={taskId} template={template} onSaved={setTemplate} />,
            },
            {
              key: "review",
              label: "Review config",
              children: <ReviewConfigEditor config={config} taskId={taskId} onSaved={setConfig} />,
            },
            {
              key: "exports",
              label: "Exports",
              children: <ExportCenter jobs={exports} taskId={taskId} onJobsChanged={setExports} />,
            },
          ]}
        />
      </section>
    </main>
  );
}
