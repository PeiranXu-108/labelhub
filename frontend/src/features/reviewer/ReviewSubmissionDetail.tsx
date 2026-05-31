import { Alert, Button, Descriptions, Result, Skeleton, Space, Table, Tag, Timeline, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
import { normalizeError, useOperationMessage } from "../feedback";
import { formatKnownText, formatLabel } from "../i18n/labels";
import { SchemaRenderer } from "../schema-renderer";
import { AssistantRail, JsonViewer, StudioPageHeader, StudioPanel, StatusPill } from "../studio";
import { approveSubmission, getReviewSubmission, returnSubmission } from "./api";
import { ReturnReasonModal } from "./ReturnReasonModal";
import type {
  AIReviewRead,
  ReviewRoundDiffFieldRead,
  ReviewSubmissionDetail as ReviewSubmissionDetailType,
} from "./types";

export function ReviewSubmissionDetail() {
  const { submissionId } = useParams();
  const showOperationError = useOperationMessage();
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
      setError(normalizeError(err, "加载提交详情失败。"));
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const aiReviews = useMemo(() => detail?.ai_reviews ?? [], [detail?.ai_reviews]);
  const humanReviews = useMemo(() => detail?.human_reviews ?? [], [detail?.human_reviews]);
  const stageHistory = useMemo(() => detail?.stage_history ?? [], [detail?.stage_history]);
  const roundDiffs = useMemo(() => detail?.round_diffs ?? [], [detail?.round_diffs]);
  const auditLogs = useMemo(() => detail?.audit_logs ?? [], [detail?.audit_logs]);

  async function approve() {
    if (!submissionId || !detail) {
      return;
    }
    setMutating(true);
    try {
      const updated = await approveSubmission(submissionId, "final_review");
      const refreshed = await getReviewSubmission(submissionId);
      setDetail({ ...refreshed, submission: updated });
    } catch (err) {
      showOperationError(err, "批准提交失败。");
    } finally {
      setMutating(false);
    }
  }

  async function returnWithReason(reason: string) {
    if (!submissionId || !detail) {
      return;
    }
    setMutating(true);
    try {
      const updated = await returnSubmission(submissionId, reason, detail.current_stage);
      const refreshed = await getReviewSubmission(submissionId);
      setDetail({ ...refreshed, submission: updated });
      setReturnOpen(false);
    } catch (err) {
      showOperationError(err, "退回提交失败。");
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
    <section className="studio-with-rail" aria-labelledby="review-detail-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="review-detail-heading">提交详情</span>}
          description={detail.task.name}
          backLink={<Link to="/review/queue">返回审核队列</Link>}
          actions={
            <Space>
              <Button loading={mutating} type="primary" onClick={() => void approve()}>
                批准
              </Button>
              <Button danger loading={mutating} onClick={() => setReturnOpen(true)}>
                退回
              </Button>
            </Space>
          }
          meta={
            <Space wrap>
              <StatusPill status={detail.submission.status}>
                当前状态：{formatLabel(detail.submission.status)}
              </StatusPill>
              {detail.current_stage ? (
                <StatusPill status={detail.current_stage}>阶段：{formatLabel(detail.current_stage)}</StatusPill>
              ) : null}
            </Space>
          }
        />

        <StudioPanel>
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="提交">{detail.submission.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag>{formatLabel(detail.submission.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="尝试次数">{detail.submission.attempt}</Descriptions.Item>
            <Descriptions.Item label="审核阶段">
              {detail.current_stage ? <Tag>{formatLabel(detail.current_stage)}</Tag> : "未进入人工审核"}
            </Descriptions.Item>
            <Descriptions.Item label="标注员">{detail.submission.labeler_id}</Descriptions.Item>
            <Descriptions.Item label="Schema 版本">{detail.submission.schema_version}</Descriptions.Item>
            <Descriptions.Item label="冻结模板">
              冻结模板版本 {detail.template_schema.version}
            </Descriptions.Item>
            <Descriptions.Item label="提交时间">
              {detail.submission.submitted_at ? new Date(detail.submission.submitted_at).toLocaleString() : "未提交"}
            </Descriptions.Item>
          </Descriptions>
        </StudioPanel>

        <AgentWorkflowTimeline workflow={detail.agent_workflow} />

        <div className="review-detail-grid">
          <JsonCard title="原始数据项内容" value={detail.item.payload} />
          <StudioPanel title="答案内容">
            <SchemaRenderer
              schema={detail.template_schema.schema_payload}
              item={{
                id: detail.item.id,
                external_id: detail.item.external_id,
                payload: detail.item.payload,
              }}
              initialAnswers={detail.submission.answer_payload}
              readOnly
            />
          </StudioPanel>
        </div>

        <StudioPanel title="AI 审核">
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
        </StudioPanel>

        <StudioPanel title="人工审核">
          {humanReviews.length > 0 ? (
            <div className="ai-review-grid">
              {humanReviews.map((review) => (
                <section className="schema-field" key={review.id}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="决策">{formatLabel(review.decision)}</Descriptions.Item>
                    <Descriptions.Item label="阶段">{formatLabel(review.stage)}</Descriptions.Item>
                    <Descriptions.Item label="轮次">第 {review.round} 轮</Descriptions.Item>
                    <Descriptions.Item label="审核员">{review.reviewer_id}</Descriptions.Item>
                    <Descriptions.Item label="对比尝试">
                      {formatAttemptPair(review.compared_from_attempt, review.compared_to_attempt)}
                    </Descriptions.Item>
                    <Descriptions.Item label="创建时间">{new Date(review.created_at).toLocaleString()}</Descriptions.Item>
                  </Descriptions>
                  {review.reason ? <Typography.Text>{review.reason}</Typography.Text> : null}
                  <JsonViewer value={review.review_metadata} />
                </section>
              ))}
            </div>
          ) : (
            <Alert message="此提交暂无人工审核记录。" type="info" />
          )}
        </StudioPanel>

        <StudioPanel title="阶段时间线">
          {stageHistory.length > 0 ? (
            <Timeline
              items={stageHistory.map((review) => ({
                children: (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>
                      {formatLabel(review.stage)} · 第 {review.round} 轮 · {formatLabel(review.decision)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {formatAttemptPair(review.compared_from_attempt, review.compared_to_attempt)}，审核员：{review.reviewer_id}
                    </Typography.Text>
                    {review.reason ? <Typography.Text>{review.reason}</Typography.Text> : null}
                    <Typography.Text type="secondary">{new Date(review.created_at).toLocaleString()}</Typography.Text>
                  </Space>
                ),
              }))}
            />
          ) : (
            <Alert message="此提交暂无阶段化人工审核记录。" type="info" />
          )}
        </StudioPanel>

        <StudioPanel title="审计时间线">
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
        </StudioPanel>

        <StudioPanel title="历史尝试">
          {detail.previous_attempts.length ? (
            <div className="ai-review-grid">
              {detail.previous_attempts.map((attempt) => (
                <section className="schema-field" key={attempt.id}>
                  <Typography.Text strong>第 {attempt.attempt} 次尝试</Typography.Text>
                  <Typography.Text type="secondary">
                    Schema 版本 {attempt.schema_version}，提交时间 {new Date(attempt.submitted_at).toLocaleString()}
                  </Typography.Text>
                  <JsonViewer value={attempt.answer_payload} />
                </section>
              ))}
            </div>
          ) : (
            <Alert message="此提交暂无历史提交尝试。" type="info" />
          )}
        </StudioPanel>

        <StudioPanel title="轮次差异">
          {roundDiffs.length ? (
            <Space className="modal-stack" direction="vertical">
              {roundDiffs.map((diff) => (
                <section className="schema-field" key={`${diff.from_attempt}-${diff.to_attempt}`}>
                  <Typography.Text strong>
                    第 {diff.from_attempt} 轮 到 第 {diff.to_attempt} 轮
                  </Typography.Text>
                  {diff.fields.length ? (
                    <Table
                      columns={[
                        {
                          title: "字段",
                          dataIndex: "field_label",
                          key: "field_label",
                        },
                        {
                          title: "变化",
                          dataIndex: "change_type",
                          key: "change_type",
                          render: (value: ReviewRoundDiffFieldRead["change_type"]) => (
                            <Tag>{formatChangeType(value)}</Tag>
                          ),
                        },
                        {
                          title: "前一轮",
                          dataIndex: "from_value",
                          key: "from_value",
                          render: (value: unknown) => <JsonViewer value={value} />,
                        },
                        {
                          title: "后一轮",
                          dataIndex: "to_value",
                          key: "to_value",
                          render: (value: unknown) => <JsonViewer value={value} />,
                        },
                      ]}
                      dataSource={diff.fields}
                      pagination={false}
                      rowKey={(field) => `${diff.from_attempt}-${diff.to_attempt}-${field.field_id}`}
                      size="small"
                    />
                  ) : (
                    <Alert message="这两轮提交的答案字段没有变化。" type="info" />
                  )}
                </section>
              ))}
            </Space>
          ) : (
            <Alert message="至少需要两个已持久化提交快照后才会生成轮次差异。" type="info" />
          )}
        </StudioPanel>

        <ReturnReasonModal
          loading={mutating}
          open={returnOpen}
          title="退回提交"
          onCancel={() => setReturnOpen(false)}
          onConfirm={(reason) => void returnWithReason(reason)}
        />
      </div>
      <AssistantRail
        context="审核详情助手会把 AI 分数、Prompt 快照、人工审核和审计轨迹整理为复核建议。"
        facts={[
          { label: "AI 审核", value: aiReviews.length },
          { label: "人工审核", value: humanReviews.length },
          { label: "历史尝试", value: detail.previous_attempts.length },
          { label: "阶段", value: detail.current_stage ? formatLabel(detail.current_stage) : "无" },
        ]}
      />
    </section>
  );
}

function formatAttemptPair(fromAttempt: number | null, toAttempt: number | null) {
  if (fromAttempt && toAttempt) {
    return `尝试 ${fromAttempt} → ${toAttempt}`;
  }
  if (toAttempt) {
    return `尝试 ${toAttempt}`;
  }
  return "未记录对比尝试";
}

function formatChangeType(changeType: ReviewRoundDiffFieldRead["change_type"]) {
  if (changeType === "added") {
    return "新增";
  }
  if (changeType === "removed") {
    return "移除";
  }
  return "变更";
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <StudioPanel title={title}>
      <JsonViewer value={value} />
    </StudioPanel>
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
      <JsonViewer value={review.structured_response} />
    </section>
  );
}
