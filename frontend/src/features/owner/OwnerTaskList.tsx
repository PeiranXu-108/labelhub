import { Alert, Button, Input, Progress, Select, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createTask, getTaskListMetrics, listTasks, transitionTask, updateTask } from "./api";
import { TaskDrawer } from "./TaskDrawer";
import type { TaskCreate, TaskListFilters, TaskListMetricsRead, TaskMetricRead, TaskRead, TaskStatus } from "./types";
import { normalizeError, useOperationMessage } from "../feedback";
import { formatLabel } from "../i18n/labels";
import { MetricStrip, StudioPageHeader, StudioPanel, StatusPill } from "../studio";

const statusColors: Record<TaskStatus, string> = {
  draft: "default",
  published: "green",
  paused: "gold",
  ended: "red",
};
const progressColumnWidth = 180;
const emptyMetrics: TaskListMetricsRead = {
  summary: {
    total_task_count: 0,
    published_task_count: 0,
    draft_task_count: 0,
    item_count: 0,
    submitted_count: 0,
    current_week_submitted_count: 0,
    average_progress_percent: 0,
  },
  task_metrics: [],
};

export function OwnerTaskList() {
  const navigate = useNavigate();
  const showOperationError = useOperationMessage();
  const [tasks, setTasks] = useState<TaskRead[]>([]);
  const [metrics, setMetrics] = useState<TaskListMetricsRead>(emptyMetrics);
  const [filters, setFilters] = useState<TaskListFilters>({});
  const [draftFilters, setDraftFilters] = useState<TaskListFilters>({});
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRead | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskResult, metricResult] = await Promise.all([
        listTasks(filters),
        getTaskListMetrics(filters),
      ]);
      setTasks(taskResult);
      setMetrics(metricResult);
    } catch (err) {
      setError(normalizeError(err, "加载任务失败"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const taskMetricsById = useMemo(() => {
    return new Map(metrics.task_metrics.map((metric) => [metric.task_id, metric]));
  }, [metrics.task_metrics]);

  const columns = useMemo(
    () => [
      {
        title: "任务",
        dataIndex: "name",
        key: "name",
        render: (_: string, record: TaskRead) => (
          <Space direction="vertical" size={0}>
            <Link className="table-primary-link" to={`/owner/tasks/${record.id}`}>
              {record.name}
            </Link>
            <Typography.Text type="secondary">{record.description || "暂无描述"}</Typography.Text>
            {record.tags.length > 0 ? (
              <Space wrap size={4}>
                {record.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </Space>
            ) : null}
          </Space>
        ),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        render: (status: TaskStatus) => <Tag color={statusColors[status]}>{formatLabel(status)}</Tag>,
      },
      {
        title: "分发方式",
        dataIndex: "distribution_strategy",
        key: "distribution_strategy",
        render: (strategy: string) => formatLabel(strategy),
      },
      {
        title: "进度",
        key: "progress",
        className: "owner-task-progress-cell",
        width: progressColumnWidth,
        render: (_: unknown, record: TaskRead) => {
          const metric = taskMetricsById.get(record.id);
          return (
            <Space direction="vertical" size={0}>
              <Progress
                className="owner-task-progress"
                percent={metric?.progress_percent ?? 0}
                size="small"
                status="normal"
              />
              <Typography.Text className="owner-task-progress-detail" type="secondary">
                {formatProgressDetail(metric)}
              </Typography.Text>
            </Space>
          );
        },
      },
      {
        title: "截止时间",
        dataIndex: "deadline_at",
        key: "deadline_at",
        render: (deadline: string | null) => (deadline ? new Date(deadline).toLocaleString() : "无"),
      },
      {
        title: "操作",
        key: "actions",
        render: (_: unknown, record: TaskRead) => (
          <Space className="owner-task-actions" size={8}>
            <Button className="owner-task-action-control" size="small" onClick={() => openEdit(record)}>
              编辑
            </Button>
            {record.status === "draft" || record.status === "paused" ? (
              <Link className="owner-task-action-link" to={`/owner/tasks/${record.id}`}>
                配置
              </Link>
            ) : null}
            {record.status === "published" ? (
              <Button
                className="owner-task-action-control"
                loading={transitioningId === record.id}
                size="small"
                onClick={() => runTransition(record.id, "pause")}
              >
                暂停
              </Button>
            ) : null}
            {record.status === "published" || record.status === "paused" ? (
              <Button
                className="owner-task-action-control"
                danger
                loading={transitioningId === record.id}
                size="small"
                onClick={() => runTransition(record.id, "end")}
              >
                结束
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [taskMetricsById, transitioningId],
  );

  function openEdit(task: TaskRead) {
    setEditingTask(task);
    setDrawerOpen(true);
  }

  function openCreate() {
    setEditingTask(null);
    setDrawerOpen(true);
  }

  function applyFilters() {
    setFilters(normalizeFilters(draftFilters));
  }

  function resetFilters() {
    setDraftFilters({});
    setFilters({});
  }

  async function submitTask(payload: TaskCreate, intent: "save" | "continue") {
    setSubmitting(true);
    setError(null);
    try {
      const saved = editingTask
        ? await updateTask(editingTask.id, {
            name: payload.name,
            description: payload.description,
            instruction_rich_text: payload.instruction_rich_text,
            instruction_plain_text: payload.instruction_plain_text,
            tags: payload.tags,
            reward_rule: payload.reward_rule,
            quality_rules: payload.quality_rules,
            distribution_strategy: payload.distribution_strategy,
            quota_per_labeler: payload.quota_per_labeler,
            deadline_at: payload.deadline_at,
          })
        : await createTask(payload);
      setDrawerOpen(false);
      setEditingTask(null);
      if (intent === "continue") {
        navigate(`/owner/tasks/${saved.id}`);
        return;
      }
      await fetchTasks();
    } catch (err) {
      showOperationError(err, "保存任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function runTransition(taskId: string, action: "publish" | "pause" | "end") {
    setTransitioningId(taskId);
    setError(null);
    try {
      const updated = await transitionTask(taskId, action);
      setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
      void fetchTasks();
    } catch (err) {
      showOperationError(err, `任务操作失败：${formatLabel(action)}`);
    } finally {
      setTransitioningId(null);
    }
  }

  return (
    <section className="studio-with-rail" aria-labelledby="owner-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="owner-heading">负责人任务</span>}
          description="创建任务，并进入运营面板完成数据、模板和发布准备。"
          actions={
        <Button type="primary" onClick={openCreate}>
          新建任务
        </Button>
          }
          meta={
            <Space wrap>
              <StatusPill status="published">已发布 {metrics.summary.published_task_count}</StatusPill>
              <StatusPill status="draft">草稿 {metrics.summary.draft_task_count}</StatusPill>
              <StatusPill status="submitted">本周提交 {metrics.summary.current_week_submitted_count}</StatusPill>
            </Space>
          }
        />
        <StudioPanel className="owner-section table-studio-panel">
          {error ? <Alert className="section-alert" message={error} type="error" /> : null}
          <MetricStrip
            items={[
              { label: "已发布任务", value: metrics.summary.published_task_count, tone: "good" },
              { label: "草稿任务", value: metrics.summary.draft_task_count },
              { label: "本周提交", value: metrics.summary.current_week_submitted_count, tone: "accent" },
              {
                label: "平均进度",
                value: `${metrics.summary.average_progress_percent}%`,
                detail: `${metrics.summary.submitted_count}/${metrics.summary.item_count} 已提交`,
              },
            ]}
          />
          <Space className="owner-task-filter-toolbar" wrap>
            <Input.Search
              allowClear
              aria-label="任务搜索"
              placeholder="搜索任务名称、ID、标签或说明"
              value={draftFilters.search ?? ""}
              onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
              onSearch={applyFilters}
            />
            <Select
              aria-label="状态筛选"
              options={[
                { label: "全部状态", value: "all" },
                { label: "草稿", value: "draft" },
                { label: "已发布", value: "published" },
                { label: "已暂停", value: "paused" },
                { label: "已结束", value: "ended" },
              ]}
              value={draftFilters.status ?? "all"}
              onChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: value === "all" ? undefined : (value as TaskStatus),
                }))
              }
            />
            <Select
              aria-label="分发方式筛选"
              options={[
                { label: "全部分发", value: "all" },
                { label: "手动分配", value: "manual" },
                { label: "自动认领", value: "auto_claim" },
              ]}
              value={draftFilters.distribution_strategy ?? "all"}
              onChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  distribution_strategy: value === "all" ? undefined : (value as "manual" | "auto_claim"),
                }))
              }
            />
            <Button onClick={applyFilters}>应用筛选</Button>
            <Button onClick={resetFilters}>重置</Button>
          </Space>
          <Table
            columns={columns}
            dataSource={tasks}
            loading={loading}
            pagination={{ pageSize: 8 }}
            rowKey="id"
            scroll={{ x: "max-content" }}
            size="middle"
          />
        </StudioPanel>
        <TaskDrawer
          open={drawerOpen}
          submitting={submitting}
          task={editingTask}
          onClose={() => setDrawerOpen(false)}
          onSubmit={submitTask}
        />
      </div>
    </section>
  );
}

function normalizeFilters(filters: TaskListFilters): TaskListFilters {
  const search = filters.search?.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.distribution_strategy ? { distribution_strategy: filters.distribution_strategy } : {}),
  };
}

function formatProgressDetail(metric: TaskMetricRead | undefined) {
  if (!metric) {
    return "0/0 已提交";
  }
  return `${metric.submitted_count}/${metric.item_count} 已提交`;
}
