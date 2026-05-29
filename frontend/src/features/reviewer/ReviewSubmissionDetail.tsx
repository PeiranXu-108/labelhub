import { Alert, Button, Descriptions, Result, Skeleton, Space, Tag, Timeline, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
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
      setError("Submission id is missing from the route.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detailResult = await getReviewSubmission(submissionId);
      setDetail(detailResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submission detail.");
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
      setError(err instanceof Error ? err.message : "Failed to approve submission.");
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
      setError(err instanceof Error ? err.message : "Failed to return submission.");
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
        <Alert action={<Button onClick={load}>Retry</Button>} message={error} type="error" />
      </section>
    );
  }

  if (!detail) {
    return (
      <Result
        status="warning"
        title="Submission is not available"
        extra={<Link to="/review/queue">Back to review queue</Link>}
      />
    );
  }

  return (
    <section className="owner-section" aria-labelledby="review-detail-heading">
      <Space direction="vertical" size={4}>
        <Link to="/review/queue">Back to review queue</Link>
        <Typography.Title id="review-detail-heading" level={1}>
          Submission detail
        </Typography.Title>
        <Typography.Text type="secondary">{detail.task.name}</Typography.Text>
      </Space>

      {error ? <Alert className="section-alert" message={error} type="error" /> : null}

      <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
        <Descriptions.Item label="Submission">{detail.submission.id}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag>{detail.submission.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Attempt">{detail.submission.attempt}</Descriptions.Item>
        <Descriptions.Item label="Labeler">{detail.submission.labeler_id}</Descriptions.Item>
        <Descriptions.Item label="Schema version">{detail.submission.schema_version}</Descriptions.Item>
        <Descriptions.Item label="Frozen template">
          Frozen template version {detail.template_schema.version}
        </Descriptions.Item>
        <Descriptions.Item label="Submitted">
          {detail.submission.submitted_at ? new Date(detail.submission.submitted_at).toLocaleString() : "Not submitted"}
        </Descriptions.Item>
      </Descriptions>

      <div className="section-actions">
        <Button loading={mutating} type="primary" onClick={() => void approve()}>
          Approve
        </Button>
        <Button danger loading={mutating} onClick={() => setReturnOpen(true)}>
          Return
        </Button>
      </div>

      <AgentWorkflowTimeline workflow={detail.agent_workflow} />

      <div className="review-detail-grid">
        <JsonCard title="Raw item payload" value={detail.item.payload} />
        <JsonCard title="Answer payload" value={detail.submission.answer_payload} />
      </div>

      <section className="ops-card">
        <Typography.Title level={2}>AI review</Typography.Title>
        {aiReviews.length > 0 ? (
          <div className="ai-review-grid">
            {aiReviews.map((review) => (
              <AIReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <Space direction="vertical">
            <Alert message="AI score data is not exposed by the current review detail API." type="info" />
            <Alert message="Prompt snapshot is not exposed by the current review detail API." type="info" />
          </Space>
        )}
      </section>

      <section className="ops-card">
        <Typography.Title level={2}>Human reviews</Typography.Title>
        {humanReviews.length > 0 ? (
          <div className="ai-review-grid">
            {humanReviews.map((review) => (
              <section className="schema-field" key={review.id}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Decision">{review.decision}</Descriptions.Item>
                  <Descriptions.Item label="Reviewer">{review.reviewer_id}</Descriptions.Item>
                  <Descriptions.Item label="Created">{new Date(review.created_at).toLocaleString()}</Descriptions.Item>
                </Descriptions>
                {review.reason ? <Typography.Text>{review.reason}</Typography.Text> : null}
                <pre className="json-panel">{JSON.stringify(review.review_metadata, null, 2)}</pre>
              </section>
            ))}
          </div>
        ) : (
          <Alert message="No human reviews were returned for this submission." type="info" />
        )}
      </section>

      <section className="ops-card">
        <Typography.Title level={2}>Audit timeline</Typography.Title>
        {auditLogs.length > 0 ? (
          <Timeline
            items={auditLogs.map((entry) => ({
              children: (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{entry.action}</Typography.Text>
                  <Typography.Text type="secondary">
                    {entry.from_status ?? "none"} to {entry.to_status ?? "none"} by {entry.actor_role}
                  </Typography.Text>
                  {entry.reason ? <Typography.Text>{entry.reason}</Typography.Text> : null}
                  <Typography.Text type="secondary">{new Date(entry.created_at).toLocaleString()}</Typography.Text>
                </Space>
              ),
            }))}
          />
        ) : (
          <Alert message="No audit records were returned for this submission." type="info" />
        )}
      </section>

      <section className="ops-card">
        <Typography.Title level={2}>Previous attempts</Typography.Title>
        {detail.previous_attempts.length ? (
          <div className="ai-review-grid">
            {detail.previous_attempts.map((attempt) => (
              <section className="schema-field" key={attempt.id}>
                <Typography.Text strong>Attempt {attempt.attempt}</Typography.Text>
                <Typography.Text type="secondary">
                  Schema version {attempt.schema_version} submitted {new Date(attempt.submitted_at).toLocaleString()}
                </Typography.Text>
                <pre className="json-panel">{JSON.stringify(attempt.answer_payload, null, 2)}</pre>
              </section>
            ))}
          </div>
        ) : (
          <Alert message="No previous submitted attempts were returned for this submission." type="info" />
        )}
      </section>

      <ReturnReasonModal
        loading={mutating}
        open={returnOpen}
        title="Return submission"
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
        <Descriptions.Item label="Decision">{review.decision}</Descriptions.Item>
        <Descriptions.Item label="Overall score">{review.overall_score}</Descriptions.Item>
        <Descriptions.Item label="Model">{review.model_name ?? "Unknown"}</Descriptions.Item>
        <Descriptions.Item label="Created">{new Date(review.created_at).toLocaleString()}</Descriptions.Item>
      </Descriptions>
      <Typography.Text strong>Prompt snapshot</Typography.Text>
      <pre className="json-panel">{review.prompt_snapshot ?? "No prompt snapshot provided."}</pre>
      <Typography.Text strong>Structured response</Typography.Text>
      <pre className="json-panel">{JSON.stringify(review.structured_response, null, 2)}</pre>
    </section>
  );
}
