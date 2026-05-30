import { Alert, Button, Skeleton, Space, Tabs, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ExportCenter } from "../../features/export/ExportCenter";
import { normalizeError } from "../../features/feedback";
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
import { AssistantRail, StudioPageHeader, StatusPill } from "../../features/studio";
import { formatLabel } from "../../features/i18n/labels";
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
      setError("路由中缺少任务 ID。");
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
      setError(normalizeError(err, "加载任务运营数据失败。"));
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
        <Alert message="路由中缺少任务 ID。" type="error" />
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
          action={<Button onClick={load}>重试</Button>}
          message={error ?? "未找到任务。"}
          type="error"
        />
      </main>
    );
  }

  return (
    <main className="page-shell owner-shell">
      <section className="studio-with-rail">
        <div className="studio-main-column owner-section">
          <StudioPageHeader
            title={task.name}
            description={task.description || "暂无描述"}
            backLink={<Link to="/owner/tasks">返回任务列表</Link>}
            meta={
              <Space wrap>
                <StatusPill status={task.status}>{formatLabel(task.status)}</StatusPill>
                <Typography.Text type="secondary">数据项 {items.length}</Typography.Text>
                <Typography.Text type="secondary">导出 {exports.length}</Typography.Text>
              </Space>
            }
          />
          <Tabs
            className="owner-tabs"
            items={[
              {
                key: "dashboard",
                label: "看板",
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
                label: "数据集",
                children: (
                  <DatasetImportPanel
                    taskId={taskId}
                    onImported={(imported) => setItems((current) => [...imported, ...current])}
                  />
                ),
              },
              {
                key: "template",
                label: "模板",
                children: <TemplateWorkspace taskId={taskId} template={template} onSaved={setTemplate} />,
              },
              {
                key: "review",
                label: "审核配置",
                children: <ReviewConfigEditor config={config} taskId={taskId} onSaved={setConfig} />,
              },
              {
                key: "exports",
                label: "导出",
                children: <ExportCenter jobs={exports} taskId={taskId} onJobsChanged={setExports} />,
              },
            ]}
          />
        </div>
        <AssistantRail
          context="任务运营助手会围绕数据集、模板、审核配置和导出状态提供下一步建议。"
          facts={[
            { label: "数据项", value: items.length },
            { label: "模板版本", value: template?.version ?? 0 },
            { label: "导出任务", value: exports.length },
          ]}
        />
      </section>
    </main>
  );
}
