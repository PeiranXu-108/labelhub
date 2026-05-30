import { Alert, Button, Input, Slider, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { Key } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { normalizeError, useOperationMessage } from "../feedback";
import type { SubmissionRead } from "../labeler/types";
import { formatLabel } from "../i18n/labels";
import { AssistantRail, StudioPageHeader, StudioPanel, StatusPill } from "../studio";
import { approveSubmission, batchReview, listReviewQueue, returnSubmission } from "./api";
import { ReturnReasonModal } from "./ReturnReasonModal";
import type { ReviewQueueItemRead } from "./types";

const reviewableStatuses = [
  "all",
  "ai_passed",
  "needs_human_review",
  "human_reviewing",
  "approved",
  "returned",
];

export function ReviewQueue() {
  const showOperationError = useOperationMessage();
  const [queueItems, setQueueItems] = useState<ReviewQueueItemRead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("");
  const [aiDecisionFilter, setAiDecisionFilter] = useState("all");
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<"batch" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queueFilters = useMemo(
    () => ({
      task_id: taskFilter.trim(),
      status: statusFilter,
      ai_decision: aiDecisionFilter,
      min_score: scoreRange[0] === 0 ? undefined : scoreRange[0],
      max_score: scoreRange[1] === 100 ? undefined : scoreRange[1],
    }),
    [aiDecisionFilter, scoreRange, statusFilter, taskFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQueueItems(await listReviewQueue(queueFilters));
    } catch (err) {
      setError(normalizeError(err, "加载审核队列失败。"));
    } finally {
      setLoading(false);
    }
  }, [queueFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approveOne(submissionId: string) {
    setMutating(submissionId);
    setError(null);
    try {
      const updated = await approveSubmission(submissionId);
      replaceSubmissions([updated]);
    } catch (err) {
      showOperationError(err, "批准提交失败。");
    } finally {
      setMutating(null);
    }
  }

  async function approveSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    setMutating("batch");
    setError(null);
    try {
      const updated = await batchReview(selectedIds.map(String), "approve");
      replaceSubmissions(updated);
      setSelectedIds([]);
    } catch (err) {
      showOperationError(err, "批量批准提交失败。");
    } finally {
      setMutating(null);
    }
  }

  async function returnWithReason(reason: string) {
    if (!returnTarget) {
      return;
    }
    setMutating(returnTarget);
    setError(null);
    try {
      const updated =
        returnTarget === "batch"
          ? await batchReview(selectedIds.map(String), "return", reason)
          : [await returnSubmission(returnTarget, reason)];
      replaceSubmissions(updated);
      setSelectedIds([]);
      setReturnTarget(null);
    } catch (err) {
      showOperationError(err, "退回提交失败。");
    } finally {
      setMutating(null);
    }
  }

  function replaceSubmissions(updated: SubmissionRead[]) {
    const updatedById = new Map(updated.map((submission) => [submission.id, submission]));
    setQueueItems((current) =>
      current.map((item) => ({
        ...item,
        submission: updatedById.get(item.submission.id) ?? item.submission,
      })),
    );
  }

  return (
    <section className="studio-with-rail" aria-labelledby="review-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="review-heading">审核队列</span>}
          description="检查 AI 分流的提交，并执行人工审核决策。"
          actions={<Button onClick={load}>刷新</Button>}
          meta={
            <Space wrap>
              <StatusPill status="needs_human_review">队列 {queueItems.length}</StatusPill>
              <StatusPill status="active">已选 {selectedIds.length}</StatusPill>
            </Space>
          }
        />

        <StudioPanel className="owner-section table-studio-panel">
          {error ? <Alert className="section-alert" message={error} type="error" /> : null}

          <div className="filter-row review-filters">
            <label className="native-filter">
              <span>状态</span>
              <select aria-label="状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                {reviewableStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "全部状态" : formatLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              aria-label="任务"
              placeholder="按任务 ID 筛选"
              value={taskFilter}
              onChange={(event) => setTaskFilter(event.target.value)}
            />
            <Tooltip title="由服务端筛选 AI 决策">
              <label className="native-filter">
                <span>AI 决策</span>
                <select
                  aria-label="AI 决策"
                  value={aiDecisionFilter}
                  onChange={(event) => setAiDecisionFilter(event.target.value)}
                >
                  <option value="all">全部决策</option>
                  <option value="pass">通过</option>
                  <option value="return">退回</option>
                  <option value="human_review">需人工审核</option>
                </select>
              </label>
            </Tooltip>
            <Tooltip title="由服务端筛选 AI 分数范围">
              <div className="score-filter" aria-label="AI 分数范围">
                <span>分数范围</span>
                <Slider range value={scoreRange} onChange={(value) => setScoreRange(value as [number, number])} />
              </div>
            </Tooltip>
          </div>

          <div className="section-actions">
            <Button disabled={selectedIds.length === 0} loading={mutating === "batch"} onClick={() => void approveSelected()}>
              批量批准
            </Button>
            <Button
              danger
              disabled={selectedIds.length === 0}
              loading={mutating === "batch"}
              onClick={() => setReturnTarget("batch")}
            >
              批量退回
            </Button>
          </div>

          <Table
            columns={[
              {
                title: "提交",
                dataIndex: "id",
                key: "id",
                render: (_: unknown, record: ReviewQueueItemRead) => (
                  <Link className="table-primary-link" to={`/review/submissions/${record.submission.id}`}>
                    {record.submission.id}
                  </Link>
                ),
              },
              {
                title: "任务",
                key: "task_id",
                render: (_: unknown, record: ReviewQueueItemRead) => record.task.name,
              },
              {
                title: "状态",
                key: "status",
                render: (_: unknown, record: ReviewQueueItemRead) => <Tag>{formatLabel(record.submission.status)}</Tag>,
              },
              {
                title: "AI",
                key: "ai",
                render: (_: unknown, record: ReviewQueueItemRead) =>
                  record.latest_ai_review ? (
                    <Space>
                      <Tag>{formatLabel(record.latest_ai_review.decision)}</Tag>
                      <Typography.Text>{record.latest_ai_review.overall_score}</Typography.Text>
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">暂无 AI 审核</Typography.Text>
                  ),
              },
              {
                title: "尝试次数",
                key: "attempt",
                render: (_: unknown, record: ReviewQueueItemRead) => record.submission.attempt,
              },
              {
                title: "更新时间",
                key: "updated_at",
                render: (_: unknown, record: ReviewQueueItemRead) =>
                  new Date(record.submission.updated_at).toLocaleString(),
              },
              {
                title: "操作",
                key: "actions",
                render: (_: unknown, record: ReviewQueueItemRead) => (
                  <Space>
                    <Button
                      loading={mutating === record.submission.id}
                      onClick={() => void approveOne(record.submission.id)}
                    >
                      批准
                    </Button>
                    <Button
                      danger
                      loading={mutating === record.submission.id}
                      onClick={() => setReturnTarget(record.submission.id)}
                    >
                      退回
                    </Button>
                  </Space>
                ),
              },
            ]}
            dataSource={queueItems}
            loading={loading}
            pagination={{ pageSize: 8 }}
            rowKey={(record) => record.submission.id}
            rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
          />
        </StudioPanel>

        <ReturnReasonModal
          loading={mutating === returnTarget}
          open={returnTarget !== null}
          title={returnTarget === "batch" ? "退回选中的提交" : "退回提交"}
          onCancel={() => setReturnTarget(null)}
          onConfirm={(reason) => void returnWithReason(reason)}
        />
      </div>
      <AssistantRail
        context="审核助手会优先解释 AI 决策、分数范围和批量处理风险。"
        facts={[
          { label: "队列项", value: queueItems.length },
          { label: "已选", value: selectedIds.length },
          { label: "分数", value: `${scoreRange[0]}-${scoreRange[1]}` },
        ]}
      />
    </section>
  );
}
