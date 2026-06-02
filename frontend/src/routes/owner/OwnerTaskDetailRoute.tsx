import { Alert, Button, Skeleton, Space, Tabs, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ExportCenter } from "../../features/export/ExportCenter";
import type { TaskAgentWorkflowSummaryRead } from "../../features/agent-workflow/types";
import { normalizeError, useOperationMessage } from "../../features/feedback";
import { DatasetImportPanel } from "../../features/owner/DatasetImportPanel";
import {
  getReviewConfig,
  getTask,
  getTaskAgentWorkflow,
  getTemplate,
  listExportJobs,
  listItems,
  transitionTask,
} from "../../features/owner/api";
import { ReviewConfigEditor } from "../../features/owner/ReviewConfigEditor";
import { TaskDashboard } from "../../features/owner/TaskDashboard";
import { TemplateWorkspace } from "../../features/owner/TemplateWorkspace";
import { StudioPageHeader, StatusPill } from "../../features/studio";
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
  const showOperationError = useOperationMessage();
  const [task, setTask] = useState<TaskRead | null>(null);
  const [items, setItems] = useState<TaskItemRead[]>([]);
  const [config, setConfig] = useState<ReviewConfig>(defaultReviewConfig);
  const [template, setTemplate] = useState<TemplateSchemaRead | null>(null);
  const [exports, setExports] = useState<ExportJobRead[]>([]);
  const [agentWorkflow, setAgentWorkflow] = useState<TaskAgentWorkflowSummaryRead | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
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

  const publishBlocker =
    items.length === 0
      ? "需要先导入至少一个数据项。"
      : template?.is_published
        ? null
        : "需要先发布标注模板。";

  async function handlePublish() {
    if (!taskId || task?.status === "published" || publishBlocker) {
      return;
    }
    setPublishing(true);
    try {
      setTask(await transitionTask(taskId, "publish"));
    } catch (err) {
      showOperationError(err, "发布任务失败。");
    } finally {
      setPublishing(false);
    }
  }

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
        <div className="studio-main-column">
          <StudioPageHeader
            title={task.name}
            description={task.description || "暂无描述"}
            backLink={<Link to="/owner/tasks">返回任务列表</Link>}
            actions={
              task.status === "draft" || task.status === "paused" ? (
                <Space wrap>
                  {items.length === 0 ? <Button onClick={() => setActiveTab("dataset")}>导入数据</Button> : null}
                  {items.length > 0 && !template?.is_published ? (
                    <Button onClick={() => setActiveTab("template")}>发布模板</Button>
                  ) : null}
                  <Button
                    disabled={Boolean(publishBlocker)}
                    loading={publishing}
                    type="primary"
                    onClick={handlePublish}
                  >
                    发布任务
                  </Button>
                </Space>
              ) : null
            }
            meta={
              <Space wrap>
                <StatusPill status={task.status}>{formatLabel(task.status)}</StatusPill>
                <Typography.Text type="secondary">数据项 {items.length}</Typography.Text>
                <Typography.Text type="secondary">
                  模板 {template?.is_published ? `已发布 v${template.version}` : "未发布"}
                </Typography.Text>
                <Typography.Text type="secondary">导出 {exports.length}</Typography.Text>
              </Space>
            }
          />
          {(task.status === "draft" || task.status === "paused") && publishBlocker ? (
            <Alert
              className="section-alert"
              message={publishBlocker}
              type="warning"
            />
          ) : null}
          <Tabs
            activeKey={activeTab}
            className="owner-tabs"
            onChange={setActiveTab}
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
      </section>
    </main>
  );
}
