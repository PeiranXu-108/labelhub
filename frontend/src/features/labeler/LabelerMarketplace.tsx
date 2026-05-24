import { Alert, Button, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { claimTask, listMarketplaceTasks, listOwnSubmissions } from "./api";
import type { TaskRead } from "../owner/types";
import type { SubmissionRead } from "./types";

export function LabelerMarketplace() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskRead[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRead[]>([]);
  const [query, setQuery] = useState("");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskResult, submissionResult] = await Promise.all([
        listMarketplaceTasks(),
        listOwnSubmissions().catch(() => []),
      ]);
      setTasks(taskResult);
      setSubmissions(submissionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load labeler marketplace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    return tasks.filter((task) => {
      const matchesQuery =
        !normalizedQuery ||
        task.name.toLowerCase().includes(normalizedQuery) ||
        (task.description ?? "").toLowerCase().includes(normalizedQuery);
      const deadlineTime = task.deadline_at ? new Date(task.deadline_at).getTime() : null;
      const matchesDeadline =
        deadlineFilter === "all" ||
        (deadlineFilter === "open" && (!deadlineTime || deadlineTime >= now)) ||
        (deadlineFilter === "overdue" && deadlineTime !== null && deadlineTime < now);
      return matchesQuery && matchesDeadline;
    });
  }, [deadlineFilter, query, tasks]);

  async function handleClaim(taskId: string) {
    setClaimingId(taskId);
    setError(null);
    try {
      const claim = await claimTask(taskId);
      navigate(`/labeler/assignments/${claim.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim a task item.");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <section className="owner-section" aria-labelledby="labeler-heading">
      <div className="panel-toolbar">
        <div>
          <Typography.Title id="labeler-heading" level={1}>
            Labeler tasks
          </Typography.Title>
          <Typography.Text type="secondary">
            Claim published work and continue drafts that need attention.
          </Typography.Text>
        </div>
        <Button onClick={load}>Refresh</Button>
      </div>

      {error ? <Alert className="section-alert" message={error} type="error" /> : null}

      <div className="filter-row">
        <Input.Search
          allowClear
          aria-label="Search tasks"
          placeholder="Search tasks"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          aria-label="Deadline filter"
          options={[
            { label: "All deadlines", value: "all" },
            { label: "Open", value: "open" },
            { label: "Overdue", value: "overdue" },
          ]}
          value={deadlineFilter}
          onChange={setDeadlineFilter}
        />
      </div>

      <Table
        columns={[
          {
            title: "Task",
            dataIndex: "name",
            key: "name",
            render: (_: string, record: TaskRead) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{record.name}</Typography.Text>
                <Typography.Text type="secondary">{record.description || "No description"}</Typography.Text>
              </Space>
            ),
          },
          {
            title: "Distribution",
            dataIndex: "distribution_strategy",
            key: "distribution_strategy",
          },
          {
            title: "Deadline",
            dataIndex: "deadline_at",
            key: "deadline_at",
            render: (deadline: string | null) => (deadline ? new Date(deadline).toLocaleString() : "None"),
          },
          {
            title: "Status",
            dataIndex: "status",
            key: "status",
            render: (status: string) => <Tag color="green">{status}</Tag>,
          },
          {
            title: "Action",
            key: "action",
            render: (_: unknown, record: TaskRead) => (
              <Button
                loading={claimingId === record.id}
                type="primary"
                onClick={() => void handleClaim(record.id)}
              >
                Claim
              </Button>
            ),
          },
        ]}
        dataSource={filteredTasks}
        loading={loading}
        pagination={{ pageSize: 8 }}
        rowKey="id"
      />

      <section className="ops-card" aria-labelledby="labeler-submissions-heading">
        <Typography.Title id="labeler-submissions-heading" level={2}>
          My submissions
        </Typography.Title>
        <Table
          columns={[
            {
              title: "Submission",
              dataIndex: "id",
              key: "id",
              render: (id: string, record: SubmissionRead) =>
                record.assignment_id ? (
                  <Link to={`/labeler/assignments/${record.assignment_id}`}>{id}</Link>
                ) : (
                  id
                ),
            },
            {
              title: "Task",
              dataIndex: "task_id",
              key: "task_id",
            },
            {
              title: "Status",
              dataIndex: "status",
              key: "status",
              render: (status: string) => <Tag>{status}</Tag>,
            },
            {
              title: "Attempt",
              dataIndex: "attempt",
              key: "attempt",
            },
            {
              title: "Updated",
              dataIndex: "updated_at",
              key: "updated_at",
              render: (value: string) => new Date(value).toLocaleString(),
            },
          ]}
          dataSource={submissions}
          pagination={{ pageSize: 5 }}
          rowKey="id"
          size="small"
        />
      </section>
    </section>
  );
}
