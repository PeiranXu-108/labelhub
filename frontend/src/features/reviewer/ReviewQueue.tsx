import { Alert, Button, Input, Slider, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { Key } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { SubmissionRead } from "../labeler/types";
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
      setError(err instanceof Error ? err.message : "Failed to load review queue.");
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
      setError(err instanceof Error ? err.message : "Failed to approve submission.");
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
      setError(err instanceof Error ? err.message : "Failed to batch approve submissions.");
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
      setError(err instanceof Error ? err.message : "Failed to return submission.");
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
    <section className="owner-section" aria-labelledby="review-heading">
      <div className="panel-toolbar">
        <div>
          <Typography.Title id="review-heading" level={1}>
            Review queue
          </Typography.Title>
          <Typography.Text type="secondary">
            Inspect AI-routed submissions and apply human review decisions.
          </Typography.Text>
        </div>
        <Button onClick={load}>Refresh</Button>
      </div>

      {error ? <Alert className="section-alert" message={error} type="error" /> : null}

      <div className="filter-row review-filters">
        <label className="native-filter">
          <span>Status</span>
          <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {reviewableStatuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : status}
              </option>
            ))}
          </select>
        </label>
        <Input
          aria-label="Task"
          placeholder="Filter by task id"
          value={taskFilter}
          onChange={(event) => setTaskFilter(event.target.value)}
        />
        <Tooltip title="Server-backed AI decision filter">
          <label className="native-filter">
            <span>AI decision</span>
            <select
              aria-label="AI decision"
              value={aiDecisionFilter}
              onChange={(event) => setAiDecisionFilter(event.target.value)}
            >
              <option value="all">All decisions</option>
              <option value="pass">pass</option>
              <option value="return">return</option>
              <option value="human_review">human_review</option>
            </select>
          </label>
        </Tooltip>
        <Tooltip title="Server-backed AI score range">
          <div className="score-filter" aria-label="AI score range">
            <span>Score range</span>
            <Slider range value={scoreRange} onChange={(value) => setScoreRange(value as [number, number])} />
          </div>
        </Tooltip>
      </div>

      <div className="section-actions">
        <Button disabled={selectedIds.length === 0} loading={mutating === "batch"} onClick={() => void approveSelected()}>
          Batch approve
        </Button>
        <Button
          danger
          disabled={selectedIds.length === 0}
          loading={mutating === "batch"}
          onClick={() => setReturnTarget("batch")}
        >
          Batch return
        </Button>
      </div>

      <Table
        columns={[
          {
            title: "Submission",
            dataIndex: "id",
            key: "id",
            render: (_: unknown, record: ReviewQueueItemRead) => (
              <Link className="table-primary-link" to={`/review/submissions/${record.submission.id}`}>
                {record.submission.id}
              </Link>
            ),
          },
          {
            title: "Task",
            key: "task_id",
            render: (_: unknown, record: ReviewQueueItemRead) => record.task.name,
          },
          {
            title: "Status",
            key: "status",
            render: (_: unknown, record: ReviewQueueItemRead) => <Tag>{record.submission.status}</Tag>,
          },
          {
            title: "AI",
            key: "ai",
            render: (_: unknown, record: ReviewQueueItemRead) =>
              record.latest_ai_review ? (
                <Space>
                  <Tag>{record.latest_ai_review.decision}</Tag>
                  <Typography.Text>{record.latest_ai_review.overall_score}</Typography.Text>
                </Space>
              ) : (
                <Typography.Text type="secondary">No AI review</Typography.Text>
              ),
          },
          {
            title: "Attempt",
            key: "attempt",
            render: (_: unknown, record: ReviewQueueItemRead) => record.submission.attempt,
          },
          {
            title: "Updated",
            key: "updated_at",
            render: (_: unknown, record: ReviewQueueItemRead) =>
              new Date(record.submission.updated_at).toLocaleString(),
          },
          {
            title: "Actions",
            key: "actions",
            render: (_: unknown, record: ReviewQueueItemRead) => (
              <Space>
                <Button
                  loading={mutating === record.submission.id}
                  onClick={() => void approveOne(record.submission.id)}
                >
                  Approve
                </Button>
                <Button
                  danger
                  loading={mutating === record.submission.id}
                  onClick={() => setReturnTarget(record.submission.id)}
                >
                  Return
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

      <ReturnReasonModal
        loading={mutating === returnTarget}
        open={returnTarget !== null}
        title={returnTarget === "batch" ? "Return selected submissions" : "Return submission"}
        onCancel={() => setReturnTarget(null)}
        onConfirm={(reason) => void returnWithReason(reason)}
      />
    </section>
  );
}
