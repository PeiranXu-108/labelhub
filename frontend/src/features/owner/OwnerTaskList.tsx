import { Alert, Button, Progress, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { createTask, listTasks, transitionTask, updateTask } from "./api";
import { TaskDrawer } from "./TaskDrawer";
import type { TaskCreate, TaskRead, TaskStatus } from "./types";
import { normalizeError, useOperationMessage } from "../feedback";
import { formatLabel } from "../i18n/labels";
import { AssistantRail, StudioPageHeader, StudioPanel, StatusPill } from "../studio";

const statusColors: Record<TaskStatus, string> = {
  draft: "default",
  published: "green",
  paused: "gold",
  ended: "red",
};

export function OwnerTaskList() {
  const showOperationError = useOperationMessage();
  const [tasks, setTasks] = useState<TaskRead[]>([]);
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
      setTasks(await listTasks());
    } catch (err) {
      setError(normalizeError(err, "加载任务失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

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
        render: () => <Progress percent={0} size="small" status="normal" />,
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
          <Space>
            <Button size="small" onClick={() => openEdit(record)}>
              编辑
            </Button>
            {record.status === "draft" || record.status === "paused" ? (
              <Link className="ant-btn ant-btn-primary ant-btn-sm" to={`/owner/tasks/${record.id}`}>
                配置
              </Link>
            ) : null}
            {record.status === "published" ? (
              <Button
                loading={transitioningId === record.id}
                size="small"
                onClick={() => runTransition(record.id, "pause")}
              >
                暂停
              </Button>
            ) : null}
            {record.status === "published" || record.status === "paused" ? (
              <Button
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
    [transitioningId],
  );

  function openEdit(task: TaskRead) {
    setEditingTask(task);
    setDrawerOpen(true);
  }

  function openCreate() {
    setEditingTask(null);
    setDrawerOpen(true);
  }

  async function submitTask(payload: TaskCreate) {
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
            quota_per_labeler: payload.quota_per_labeler,
            deadline_at: payload.deadline_at,
          })
        : await createTask(payload);
      setTasks((current) => {
        if (editingTask) {
          return current.map((task) => (task.id === saved.id ? saved : task));
        }
        return [saved, ...current];
      });
      setDrawerOpen(false);
      setEditingTask(null);
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
              <StatusPill status="published">已发布 {tasks.filter((task) => task.status === "published").length}</StatusPill>
              <StatusPill status="draft">草稿 {tasks.filter((task) => task.status === "draft").length}</StatusPill>
            </Space>
          }
        />
        <StudioPanel className="owner-section table-studio-panel">
          {error ? <Alert className="section-alert" message={error} type="error" /> : null}
          <Table
            columns={columns}
            dataSource={tasks}
            loading={loading}
            pagination={{ pageSize: 8 }}
            rowKey="id"
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
      <AssistantRail
        context="负责人视角会优先关注任务状态、模板发布、数据导入和可导出的已批准结果。"
        facts={[
          { label: "任务总数", value: tasks.length },
          { label: "待配置", value: tasks.filter((task) => task.status === "draft" || task.status === "paused").length },
        ]}
      />
    </section>
  );
}
