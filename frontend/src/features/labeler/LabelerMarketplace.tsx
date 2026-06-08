import { Alert, Button, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { claimTask, listMarketplaceTasks, listOwnSubmissions } from "./api";
import { normalizeError, useOperationMessage } from "../feedback";
import { formatLabel } from "../i18n/labels";
import type { TaskRead } from "../owner/types";
import { StudioPageHeader, StudioPanel, StatusPill } from "../studio";
import { formatRewardRule } from "../task-metadata/TaskMetadataPanel";
import type { SubmissionRead } from "./types";

export function LabelerMarketplace() {
  const navigate = useNavigate();
  const showOperationError = useOperationMessage();
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
      setError(normalizeError(err, "加载标注任务市场失败。"));
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
        (task.description ?? "").toLowerCase().includes(normalizedQuery) ||
        (task.instruction_plain_text ?? "").toLowerCase().includes(normalizedQuery) ||
        task.tags.some((tag) => tag.includes(normalizedQuery));
      const deadlineTime = task.deadline_at ? new Date(task.deadline_at).getTime() : null;
      const matchesDeadline =
        deadlineFilter === "all" ||
        (deadlineFilter === "open" && (!deadlineTime || deadlineTime >= now)) || (deadlineFilter === "overdue" && deadlineTime !== null && deadlineTime < now);
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
      showOperationError(err, "认领任务数据项失败。");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <section className="studio-with-rail" aria-labelledby="labeler-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="labeler-heading">标注任务</span>}
          description="认领已发布任务，并继续处理需要关注的草稿。"
          actions={<Button onClick={load}>刷新</Button>}
          meta={
            <Space wrap>
              <StatusPill status="published">可认领 {filteredTasks.length}</StatusPill>
              <StatusPill status="draft">我的提交 {submissions.length}</StatusPill>
            </Space>
          }
        />

        <StudioPanel className="owner-section table-studio-panel">
          {error ? <Alert className="section-alert" message={error} type="error" /> : null}

          <div className="filter-row">
            <Input.Search
              allowClear
              aria-label="搜索任务"
              placeholder="搜索任务"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="截止时间筛选"
              options={[
                { label: "全部截止时间", value: "all" },
                { label: "未逾期", value: "open" },
                { label: "已逾期", value: "overdue" },
              ]}
              value={deadlineFilter}
              onChange={setDeadlineFilter}
            />
          </div>

          <Table
            columns={[
              {
                title: "任务",
                dataIndex: "name",
                key: "name",
                render: (_: string, record: TaskRead) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{record.name}</Typography.Text>
                    <Typography.Text type="secondary">{record.description || "暂无描述"}</Typography.Text>
                    {record.instruction_plain_text ? (
                      <Typography.Text type="secondary">{record.instruction_plain_text}</Typography.Text>
                    ) : null}
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
                title: "奖励",
                dataIndex: "reward_rule",
                key: "reward_rule",
                render: (_: unknown, record: TaskRead) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text>{formatRewardRule(record.reward_rule)}</Typography.Text>
                    {record.reward_rule.description ? (
                      <Typography.Text type="secondary">{record.reward_rule.description}</Typography.Text>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: "分发方式",
                dataIndex: "distribution_strategy",
                key: "distribution_strategy",
                render: (strategy: string) => formatLabel(strategy),
              },
              {
                title: "截止时间",
                dataIndex: "deadline_at",
                key: "deadline_at",
                render: (deadline: string | null) => (deadline ? new Date(deadline).toLocaleString() : "无"),
              },
              {
                title: "状态",
                dataIndex: "status",
                key: "status",
                render: (status: string) => <Tag color="green">{formatLabel(status)}</Tag>,
              },
              {
                title: "操作",
                key: "action",
                render: (_: unknown, record: TaskRead) => (
                  <Button
                    loading={claimingId === record.id}
                    type="primary"
                    onClick={() => void handleClaim(record.id)}
                  >
                    认领
                  </Button>
                ),
              },
            ]}
            dataSource={filteredTasks}
            loading={loading}
            pagination={{ pageSize: 8 }}
            rowKey="id"
            scroll={{ x: "max-content" }}
          />
        </StudioPanel>

        <StudioPanel className="ops-card" title="我的提交">
          <Table
            columns={[
              {
                title: "提交",
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
                title: "任务",
                dataIndex: "task_id",
                key: "task_id",
              },
              {
                title: "状态",
                dataIndex: "status",
                key: "status",
                render: (status: string) => <Tag>{formatLabel(status)}</Tag>,
              },
              {
                title: "尝试次数",
                dataIndex: "attempt",
                key: "attempt",
              },
              {
                title: "更新时间",
                dataIndex: "updated_at",
                key: "updated_at",
                render: (value: string) => new Date(value).toLocaleString(),
              },
            ]}
            dataSource={submissions}
            pagination={{ pageSize: 5 }}
            rowKey="id"
            scroll={{ x: "max-content" }}
            size="small"
          />
        </StudioPanel>
      </div>
    </section>
  );
}
