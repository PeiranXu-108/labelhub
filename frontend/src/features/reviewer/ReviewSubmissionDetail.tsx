import { Alert, Button, Descriptions, Result, Skeleton, Space, Tag, Timeline, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
import { formatKnownText, formatLabel } from "../i18n/labels";
import { approveSubmission, getReviewSubmission, returnSubmission } from "./api";
import { ReturnReasonModal } from "./ReturnReasonModal";
import type { AIReviewRead, ReviewSubmissionDetail as ReviewSubmissionDetailType } from "./types";

export function ReviewSubmissionDetail() {
  const { submissionId } = useParams();
  const [detail, setDetail] = useState<ReviewSubmissionDetailType | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!submissionId) {
      setError("路由中缺少提交 ID。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detailResult = await getReviewSubmission(submissionId);
      setDetail(detailResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载提交详情失败。");
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const aiReviews = useMemo(() => detail?.ai_reviews ?? [], [detail?.ai_reviews]);
  const humanReviews = useMemo(() => detail?.human_reviews ?? [], [detail?.human_reviews]);
  const auditLogs = useMemo(() => detail?.audit_logs ?? [], [detail?.audit_logs]);

  async function approve() {
    if (!submissionId || !detail) {
      return;
    }
    setMutating(true);
    setError(null);
    try {
      const updated = await approveSubmission(submissionId);
      const refreshed = await getReviewSubmission(submissionId);
      setDetail({ ...refreshed, submission: updated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "批准提交失败。");
    } finally {
      setMutating(false);
    }
  }

  async function returnWithReason(reason: string) {
    if (!submissionId || !detail) {
      return;
    }
    setMutating(true);
    setError(null);
    try {
      const updated = await returnSubmission(submissionId, reason);
      const refreshed = await getReviewSubmission(submissionId);
      setDetail({ ...refreshed, submission: updated });
      setReturnOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "退回提交失败。");
    } finally {
      setMutating(false);
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
    return (
      <Result
        status="warning"
        title="提交不可用"
        extra={<Link to="/review/queue">返回审核队列</Link>}
      />
    );
  }

  return (
    <section className="owner-section" aria-labelledby="review-detail-heading">
      <Space direction="vertical" size={4}>
        <Link to="/review/queue">返回审核队列</Link>
        <Typography.Title id="review-detail-heading" level={1}>
          提交详情
        </Typography.Title>
        <Typography.Text type="secondary">{detail.task.name}</Typography.Text>
      </Space>

      {error ? <Alert className="section-alert" message={error} type="error" /> : null}

      <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
        <Descriptions.Item label="提交">{detail.submission.id}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag>{formatLabel(detail.submission.status)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="尝试次数">{detail.submission.attempt}</Descriptions.Item>
        <Descriptions.Item label="标注员">{detail.submission.labeler_id}</Descriptions.Item>
        <Descriptions.Item label="Schema 版本">{detail.submission.schema_version}</Descriptions.Item>
        <Descriptions.Item label="冻结模板">
          冻结模板版本 {detail.template_schema.version}
        </Descriptions.Item>
        <Descriptions.Item label="提交时间">
          {detail.submission.submitted_at ? new Date(detail.submission.submitted_at).toLocaleString() : "未提交"}
        </Descriptions.Item>
      </Descriptions>

      <div className="section-actions">
        <Button loading={mutating} type="primary" onClick={() => void approve()}>
          批准
        </Button>
        <Button danger loading={mutating} onClick={() => setReturnOpen(true)}>
          退回
        </Button>
      </div>

      <AgentWorkflowTimeline workflow={detail.agent_workflow} />

      <div className="review-detail-grid">
        <JsonCard title="原始数据项内容" value={detail.item.payload} />
        <JsonCard title="答案内容" value={detail.submission.answer_payload} />
      </div>

      <section className="ops-card">
        <Typography.Title level={2}>AI 审核</Typography.Title>
        {aiReviews.length > 0 ? (
          <div className="ai-review-grid">
            {aiReviews.map((review) => (
              <AIReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <Space direction="vertical">
            <Alert message="当前审核详情 API 尚未暴露 AI 分数数据。" type="info" />
            <Alert message="当前审核详情 API 尚未暴露 Prompt 快照。" type="info" />
          </Space>
        )}
      </section>

      <section className="ops-card">
        <Typography.Title level={2}>人工审核</Typography.Title>
        {humanReviews.length > 0 ? (
          <div className="ai-review-grid">
            {humanReviews.map((review) => (
              <section className="schema-field" key={review.id}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="决策">{formatLabel(review.decision)}</Descriptions.Item>
                  <Descriptions.Item label="审核员">{review.reviewer_id}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">{new Date(review.created_at).toLocaleString()}</Descriptions.Item>
                </Descriptions>
                {review.reason ? <Typography.Text>{review.reason}</Typography.Text> : null}
                <pre className="json-panel">{JSON.stringify(review.review_metadata, null, 2)}</pre>
              </section>
            ))}
          </div>
        ) : (
          <Alert message="此提交暂无人工审核记录。" type="info" />
        )}
      </section>

      <section className="ops-card">
        <Typography.Title level={2}>审计时间线</Typography.Title>
        {auditLogs.length > 0 ? (
          <Timeline
            items={auditLogs.map((entry) => ({
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
          <Alert message="此提交暂无审计记录。" type="info" />
        )}
      </section>

      <section className="ops-card">
        <Typography.Title level={2}>历史尝试</Typography.Title>
        {detail.previous_attempts.length ? (
          <div className="ai-review-grid">
            {detail.previous_attempts.map((attempt) => (
              <section className="schema-field" key={attempt.id}>
                <Typography.Text strong>第 {attempt.attempt} 次尝试</Typography.Text>
                <Typography.Text type="secondary">
                  Schema 版本 {attempt.schema_version}，提交时间 {new Date(attempt.submitted_at).toLocaleString()}
                </Typography.Text>
                <pre className="json-panel">{JSON.stringify(attempt.answer_payload, null, 2)}</pre>
              </section>
            ))}
          </div>
        ) : (
          <Alert message="此提交暂无历史提交尝试。" type="info" />
        )}
      </section>

      <ReturnReasonModal
        loading={mutating}
        open={returnOpen}
        title="退回提交"
        onCancel={() => setReturnOpen(false)}
        onConfirm={(reason) => void returnWithReason(reason)}
      />
    </section>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="ops-card">
      <Typography.Title level={2}>{title}</Typography.Title>
      <pre className="json-panel">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function AIReviewCard({ review }: { review: AIReviewRead }) {
  return (
    <section className="schema-field">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="决策">{formatLabel(review.decision)}</Descriptions.Item>
        <Descriptions.Item label="总分">{review.overall_score}</Descriptions.Item>
        <Descriptions.Item label="模型">{review.model_name ?? "未知"}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{new Date(review.created_at).toLocaleString()}</Descriptions.Item>
      </Descriptions>
      <Typography.Text strong>Prompt 快照</Typography.Text>
      <pre className="json-panel">{review.prompt_snapshot ?? "未提供 Prompt 快照。"}</pre>
      <Typography.Text strong>结构化响应</Typography.Text>
      <pre className="json-panel">{JSON.stringify(review.structured_response, null, 2)}</pre>
    </section>
  );
}
