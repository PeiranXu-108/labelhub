import { Alert, Button, Descriptions, Input, Skeleton, Space, Table, Tag, Timeline, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { normalizeError, useOperationMessage } from "../feedback";
import { formatKnownText, formatLabel } from "../i18n/labels";
import { JsonViewer, MetricStrip, StudioPageHeader, StudioPanel, StatusPill } from "../studio";
import { AgentWorkflowTimeline } from "./AgentWorkflowTimeline";
import { getAIOperationRun, listAIOperationRuns, retryAIOperationRun } from "./api";
import type {
  AIOperationReviewRead,
  AIOperationRunDetailRead,
  AIOperationRunFilters,
  AIOperationRunListItemRead,
  AIOperationRunStatus,
} from "./aiOperationsTypes";

const runStatuses: Array<AIOperationRunStatus | "all"> = [
  "all",
  "pending",
  "running",
  "passed",
  "returned",
  "human_review",
  "failed",
];

export function AIOperationsPage() {
  const [searchParams] = useSearchParams();
  const [runs, setRuns] = useState<AIOperationRunListItemRead[]>([]);
  const [runStatus, setRunStatus] = useState<AIOperationRunStatus | "all">("all");
  const [aiDecision, setAiDecision] = useState("all");
  const [taskFilter, setTaskFilter] = useState(() => searchParams.get("task_id") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<AIOperationRunFilters>(
    () => ({
      run_status: runStatus,
      ai_decision: aiDecision,
      task_id: taskFilter.trim(),
    }),
    [aiDecision, runStatus, taskFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await listAIOperationRuns(filters));
    } catch (err) {
      setError(normalizeError(err, "加载 AI 预审运维队列失败。"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => countByRunStatus(runs), [runs]);

  return (
    <section className="studio-with-rail" aria-labelledby="ai-operations-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="ai-operations-heading">AI 预审运维</span>}
          description="查看 AI 预审运行、失败原因、Prompt 快照和安全重试状态。"
          actions={<Button onClick={load}>刷新</Button>}
          meta={
            <Space wrap>
              <StatusPill status="pending">待处理 {counts.pending ?? 0}</StatusPill>
              <StatusPill status="running">运行中 {counts.running ?? 0}</StatusPill>
              <StatusPill status="failed">失败 {counts.failed ?? 0}</StatusPill>
            </Space>
          }
        />

        <StudioPanel className="owner-section table-studio-panel">
          {error ? <Alert className="section-alert" message={error} type="error" /> : null}
          <div className="filter-row review-filters">
            <label className="native-filter">
              <span>运行状态</span>
              <select
                aria-label="运行状态"
                value={runStatus}
                onChange={(event) => setRunStatus(event.target.value as AIOperationRunStatus | "all")}
              >
                {runStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "全部运行" : formatLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="native-filter">
              <span>AI 决策</span>
              <select aria-label="AI 决策" value={aiDecision} onChange={(event) => setAiDecision(event.target.value)}>
                <option value="all">全部决策</option>
                <option value="pass">通过</option>
                <option value="return">退回</option>
                <option value="human_review">需人工审核</option>
              </select>
            </label>
            <Input
              aria-label="任务"
              placeholder="按任务 ID 筛选"
              value={taskFilter}
              onChange={(event) => setTaskFilter(event.target.value)}
            />
          </div>
          <Table
            columns={[
              {
                title: "提交",
                key: "submission_id",
                render: (_: unknown, record: AIOperationRunListItemRead) => (
                  <Link className="table-primary-link" to={`/ai-operations/runs/${record.submission_id}`}>
                    {record.submission_id}
                  </Link>
                ),
              },
              { title: "任务", dataIndex: "task_name", key: "task_name" },
              {
                title: "运行",
                key: "run_status",
                render: (_: unknown, record: AIOperationRunListItemRead) => (
                  <Space wrap>
                    <StatusPill status={record.run_status}>{formatLabel(record.run_status)}</StatusPill>
                    <Tag>{formatLabel(record.workflow_status)}</Tag>
                  </Space>
                ),
              },
              {
                title: "AI",
                key: "ai",
                render: (_: unknown, record: AIOperationRunListItemRead) => (
                  <Space wrap>
                    {record.ai_decision ? <Tag>{formatLabel(record.ai_decision)}</Tag> : <Typography.Text type="secondary">未生成</Typography.Text>}
                    {record.overall_score === null ? null : <Typography.Text>{record.overall_score}</Typography.Text>}
                  </Space>
                ),
              },
              { title: "模型", dataIndex: "model_name", key: "model_name", render: (value) => value ?? "待处理" },
              {
                title: "重试",
                key: "retries",
                render: (_: unknown, record: AIOperationRunListItemRead) => (
                  <Typography.Text>
                    模型 {record.retry_count} / 运维 {record.operator_retry_count}
                  </Typography.Text>
                ),
              },
              { title: "幂等键", dataIndex: "idempotency_key", key: "idempotency_key" },
              {
                title: "更新时间",
                key: "updated_at",
                render: (_: unknown, record: AIOperationRunListItemRead) => new Date(record.updated_at).toLocaleString(),
              },
            ]}
            dataSource={runs}
            loading={loading}
            pagination={{ pageSize: 10 }}
            rowKey="submission_id"
            scroll={{ x: "max-content" }}
          />
        </StudioPanel>
      </div>
    </section>
  );
}

export function AIOperationDetailPage() {
  const { submissionId } = useParams();
  const showOperationError = useOperationMessage();
  const [detail, setDetail] = useState<AIOperationRunDetailRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!submissionId) {
      setError("路由中缺少提交 ID。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDetail(await getAIOperationRun(submissionId));
    } catch (err) {
      setError(normalizeError(err, "加载 AI 预审详情失败。"));
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryRun() {
    if (!submissionId) {
      return;
    }
    setRetrying(true);
    setMutationError(null);
    setRetryNote(null);
    try {
      const response = await retryAIOperationRun(submissionId);
      setDetail(response.detail);
      if (!response.retry_performed) {
        setRetryNote("已存在同一提交尝试的完成 AI 审核，未创建重复运行。");
      }
    } catch (err) {
      const message = normalizeError(err, "重试 AI 审核失败。");
      setMutationError(message);
      showOperationError(err, "重试 AI 审核失败。");
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <section className="owner-section">
        <Skeleton active paragraph={{ rows: 10 }} />
      </section>
    );
  }

  if (error && !detail) {
    return (
      <section className="owner-section">
        <Alert action={<Button onClick={load}>重试</Button>} message={error} type="error" />
      </section>
    );
  }

  if (!detail) {
    return <Alert message="AI 预审详情不可用。" type="warning" />;
  }

  const latestReview = detail.latest_ai_review;

  return (
    <section className="studio-with-rail" aria-labelledby="ai-operation-detail-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="ai-operation-detail-heading">AI 预审详情</span>}
          description={detail.task.name}
          backLink={<Link to="/ai-operations">返回 AI 预审运维</Link>}
          actions={
            <Button
              disabled={detail.run_status !== "failed"}
              loading={retrying}
              type="primary"
              onClick={() => void retryRun()}
            >
              重试 AI 审核
            </Button>
          }
          meta={
            <Space wrap>
              <StatusPill status={detail.run_status}>{formatLabel(detail.run_status)}</StatusPill>
              <StatusPill status={detail.workflow_status}>{formatLabel(detail.workflow_status)}</StatusPill>
              <Typography.Text type="secondary">幂等键 {detail.idempotency_key}</Typography.Text>
            </Space>
          }
        />

        {mutationError ? <Alert className="section-alert" message={mutationError} type="error" /> : null}
        {retryNote ? <Alert className="section-alert" message={retryNote} type="info" /> : null}

        <MetricStrip
          items={[
            { label: "AI 分数", value: detail.overall_score ?? "待处理", tone: detail.run_status === "failed" ? "danger" : "accent" },
            { label: "模型重试", value: detail.retry_count, tone: detail.retry_count ? "warning" : "neutral" },
            { label: "运维重试", value: detail.operator_retry_count, tone: detail.operator_retry_count ? "warning" : "neutral" },
            { label: "尝试", value: detail.attempt },
          ]}
        />

        <StudioPanel title="运行摘要">
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="提交">{detail.submission_id}</Descriptions.Item>
            <Descriptions.Item label="任务">{detail.task_name}</Descriptions.Item>
            <Descriptions.Item label="标注员">{detail.labeler_id}</Descriptions.Item>
            <Descriptions.Item label="状态">{formatLabel(detail.workflow_status)}</Descriptions.Item>
            <Descriptions.Item label="AI 决策">{formatLabel(detail.ai_decision ?? "pending")}</Descriptions.Item>
            <Descriptions.Item label="模型">{detail.model_name ?? "待处理"}</Descriptions.Item>
            <Descriptions.Item label="幂等键">{detail.idempotency_key}</Descriptions.Item>
            <Descriptions.Item label="模型重试">{detail.retry_count}</Descriptions.Item>
            <Descriptions.Item label="运维重试">{detail.operator_retry_count}</Descriptions.Item>
          </Descriptions>
        </StudioPanel>

        <StudioPanel title="审核配置">
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="通过阈值">{detail.review_config.pass_threshold}</Descriptions.Item>
            <Descriptions.Item label="退回阈值">{detail.review_config.return_threshold}</Descriptions.Item>
            <Descriptions.Item label="人工阈值">{detail.review_config.manual_review_threshold}</Descriptions.Item>
            <Descriptions.Item label="模型">{detail.review_config.model_name}</Descriptions.Item>
            <Descriptions.Item label="温度">{detail.review_config.temperature}</Descriptions.Item>
            <Descriptions.Item label="最大模型重试">{detail.review_config.max_retries}</Descriptions.Item>
          </Descriptions>
          <JsonViewer value={detail.review_config.criteria} />
        </StudioPanel>

        <AgentWorkflowTimeline workflow={detail.agent_workflow} />

        <div className="review-detail-grid">
          <JsonCard title="数据项内容" value={detail.item_payload} />
          <JsonCard title="提交答案" value={detail.answer_payload} />
        </div>

        <StudioPanel title="AI 结论">
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="决策">{formatLabel(detail.verdict.decision ?? "pending")}</Descriptions.Item>
            <Descriptions.Item label="总分">{detail.overall_score ?? "待处理"}</Descriptions.Item>
            <Descriptions.Item label="状态">{formatLabel(latestReview?.status ?? detail.run_status)}</Descriptions.Item>
          </Descriptions>
          {detail.verdict.summary ? <Typography.Paragraph>{detail.verdict.summary}</Typography.Paragraph> : null}
          <Table
            columns={[
              { title: "维度", dataIndex: "key", key: "key" },
              { title: "分数", dataIndex: "score", key: "score" },
              { title: "理由", dataIndex: "reason", key: "reason" },
            ]}
            dataSource={detail.score_dimensions}
            pagination={false}
            rowKey={(row) => String(row.key)}
            scroll={{ x: "max-content" }}
            size="small"
          />
        </StudioPanel>

        <StudioPanel title="Prompt 快照">
          <pre className="json-panel">{latestReview?.prompt_snapshot ?? "未生成 Prompt 快照。"}</pre>
        </StudioPanel>

        <div className="review-detail-grid">
          <JsonCard title="结构化响应" value={latestReview?.structured_response ?? {}} />
          <JsonCard title="模型元数据" value={latestReview?.error_metadata?.model_metadata ?? { model_name: latestReview?.model_name }} />
        </div>
        <div className="review-detail-grid">
          <JsonCard title="原始响应" value={latestReview?.raw_provider_response ?? {}} />
          <JsonCard title="错误元数据" value={latestReview?.error_metadata ?? {}} />
        </div>

        <StudioPanel title="处理日志">
          {detail.processing_logs.length ? (
            <Timeline
              items={detail.processing_logs.map((entry) => ({
                children: (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{formatKnownText(entry.action)}</Typography.Text>
                    <Typography.Text type="secondary">
                      {formatLabel(entry.from_status ?? "none")} 到 {formatLabel(entry.to_status ?? "none")}，操作人：{formatLabel(entry.actor_role)}
                    </Typography.Text>
                    {entry.reason ? <Typography.Text>{entry.reason}</Typography.Text> : null}
                    <Typography.Text type="secondary">{new Date(entry.created_at).toLocaleString()}</Typography.Text>
                  </Space>
                ),
              }))}
            />
          ) : (
            <Alert message="暂无 AI 处理日志。" type="info" />
          )}
        </StudioPanel>

        <StudioPanel title="AI 运行历史">
          <div className="ai-review-grid">
            {detail.ai_reviews.map((review) => (
              <AIReviewRunCard key={review.id} review={review} />
            ))}
          </div>
        </StudioPanel>
      </div>
    </section>
  );
}

function countByRunStatus(runs: AIOperationRunListItemRead[]) {
  return runs.reduce<Record<string, number>>((counts, run) => {
    counts[run.run_status] = (counts[run.run_status] ?? 0) + 1;
    return counts;
  }, {});
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <StudioPanel title={title}>
      <JsonViewer value={value} />
    </StudioPanel>
  );
}

function AIReviewRunCard({ review }: { review: AIOperationReviewRead }) {
  return (
    <section className="schema-field">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">{formatLabel(review.status)}</Descriptions.Item>
        <Descriptions.Item label="决策">{formatLabel(review.decision)}</Descriptions.Item>
        <Descriptions.Item label="分数">{review.overall_score}</Descriptions.Item>
        <Descriptions.Item label="模型">{review.model_name ?? "未知"}</Descriptions.Item>
        <Descriptions.Item label="幂等键">{review.idempotency_key}</Descriptions.Item>
        <Descriptions.Item label="模型重试">{review.retry_count}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{new Date(review.created_at).toLocaleString()}</Descriptions.Item>
      </Descriptions>
    </section>
  );
}
