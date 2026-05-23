import { Alert, Button, Progress, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { createTask, listTasks, transitionTask, updateTask } from "./api";
import { TaskDrawer } from "./TaskDrawer";
import type { TaskCreate, TaskRead, TaskStatus } from "./types";

const statusColors: Record<TaskStatus, string> = {
  draft: "default",
  published: "green",
  paused: "gold",
  ended: "red",
};

export function OwnerTaskList() {
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
      setError(err instanceof Error ? err.message : "Failed to load tasks");
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
        title: "Task",
        dataIndex: "name",
        key: "name",
        render: (_: string, record: TaskRead) => (
          <Space direction="vertical" size={0}>
            <Link className="table-primary-link" to={`/owner/tasks/${record.id}`}>
              {record.name}
            </Link>
            <Typography.Text type="secondary">{record.description || "No description"}</Typography.Text>
          </Space>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: TaskStatus) => <Tag color={statusColors[status]}>{status}</Tag>,
      },
      {
        title: "Distribution",
        dataIndex: "distribution_strategy",
        key: "distribution_strategy",
      },
      {
        title: "Progress",
        key: "progress",
        render: () => <Progress percent={0} size="small" status="normal" />,
      },
      {
        title: "Deadline",
        dataIndex: "deadline_at",
        key: "deadline_at",
        render: (deadline: string | null) => (deadline ? new Date(deadline).toLocaleString() : "None"),
      },
      {
        title: "Actions",
        key: "actions",
        render: (_: unknown, record: TaskRead) => (
          <Space>
            <Button size="small" onClick={() => openEdit(record)}>
              Edit
            </Button>
            {record.status === "draft" || record.status === "paused" ? (
              <Button
                loading={transitioningId === record.id}
                size="small"
                type="primary"
                onClick={() => runTransition(record.id, "publish")}
              >
                Publish
              </Button>
            ) : null}
            {record.status === "published" ? (
              <Button
                loading={transitioningId === record.id}
                size="small"
                onClick={() => runTransition(record.id, "pause")}
              >
                Pause
              </Button>
            ) : null}
            {record.status === "published" || record.status === "paused" ? (
              <Button
                danger
                loading={transitioningId === record.id}
                size="small"
                onClick={() => runTransition(record.id, "end")}
              >
                End
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
      setError(err instanceof Error ? err.message : "Failed to save task");
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
      setError(err instanceof Error ? err.message : `Failed to ${action} task`);
    } finally {
      setTransitioningId(null);
    }
  }

  return (
    <section className="owner-section" aria-labelledby="owner-heading">
      <div className="panel-toolbar">
        <div>
          <Typography.Title id="owner-heading" level={1}>
            Owner tasks
          </Typography.Title>
          <Typography.Text type="secondary">Create tasks, publish workflow states, and open task operations.</Typography.Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          New task
        </Button>
      </div>
      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      <Table
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={{ pageSize: 8 }}
        rowKey="id"
        size="middle"
      />
      <TaskDrawer
        open={drawerOpen}
        submitting={submitting}
        task={editingTask}
        onClose={() => setDrawerOpen(false)}
        onSubmit={submitTask}
      />
    </section>
  );
}
