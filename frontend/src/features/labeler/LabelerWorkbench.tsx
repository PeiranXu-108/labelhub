import { Alert, Button, Descriptions, Result, Skeleton, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
import type { AgentWorkflowRead } from "../agent-workflow/types";
import { SchemaRenderer } from "../schema-renderer";
import type { AnswerPayload } from "../schema-renderer";
import { getAssignmentAgentWorkflow, getAssignmentWithTemplate, saveAssignmentDraft, submitAssignment } from "./api";
import type { AssignmentDetailRead, SubmissionRead } from "./types";
import type { TemplateSchemaRead } from "../owner/types";

const AUTOSAVE_DEBOUNCE_MS = 900;

type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error";

function sameAnswers(left: AnswerPayload, right: AnswerPayload) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function LabelerWorkbench() {
  const { assignmentId } = useParams();
  const [assignment, setAssignment] = useState<AssignmentDetailRead | null>(null);
  const [template, setTemplate] = useState<TemplateSchemaRead | null>(null);
  const [submission, setSubmission] = useState<SubmissionRead | null>(null);
  const [agentWorkflow, setAgentWorkflow] = useState<AgentWorkflowRead | null>(null);
  const [answers, setAnswers] = useState<AnswerPayload>({});
  const latestAnswers = useRef<AnswerPayload>({});
  const editedRef = useRef(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assignmentId) {
      setError("Assignment id is missing from the route.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getAssignmentWithTemplate(assignmentId);
      setAssignment(result.assignment);
      setTemplate(result.template);
      setSubmission(result.assignment.submission);
      setAgentWorkflow(result.agentWorkflow);
      setAnswers(result.assignment.submission.answer_payload ?? {});
      latestAnswers.current = result.assignment.submission.answer_payload ?? {};
      editedRef.current = false;
      setAutosaveState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignment.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!assignmentId || !editedRef.current) {
      return undefined;
    }

    setAutosaveState("pending");
    const timeout = window.setTimeout(() => {
      const snapshot = latestAnswers.current;
      setAutosaveState("saving");
      saveAssignmentDraft(assignmentId, snapshot)
        .then((saved) => {
          setSubmission(saved);
          if (sameAnswers(latestAnswers.current, snapshot)) {
            editedRef.current = false;
            setAutosaveState("saved");
          } else {
            setAutosaveState("pending");
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to autosave draft.");
          setAutosaveState("error");
        });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [answers, assignmentId]);

  function handleChange(nextAnswers: AnswerPayload) {
    latestAnswers.current = nextAnswers;
    editedRef.current = true;
    setAnswers(nextAnswers);
  }

  async function handleSubmit(nextAnswers: AnswerPayload) {
    if (!assignmentId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved = await submitAssignment(assignmentId, nextAnswers);
      setSubmission(saved);
      setAgentWorkflow(await getAssignmentAgentWorkflow(assignmentId).catch(() => null));
      setAnswers(saved.answer_payload);
      latestAnswers.current = saved.answer_payload;
      editedRef.current = false;
      setAutosaveState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit assignment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="owner-section">
        <Skeleton active paragraph={{ rows: 8 }} />
      </section>
    );
  }

  if (error && (!assignment || !template || !submission)) {
    return (
      <section className="owner-section">
        <Alert action={<Button onClick={load}>Retry</Button>} message={error} type="error" />
      </section>
    );
  }

  if (!assignment || !template || !submission) {
    return (
      <Result
        status="warning"
        title="Assignment is not available"
        extra={<Link to="/labeler/tasks">Back to labeler tasks</Link>}
      />
    );
  }

  const versionMismatch = template.version !== submission.schema_version;
  const isReturned = submission.status === "returned" || submission.status === "ai_returned";
  const returnReason = assignment.latest_human_review?.reason;

  return (
    <section className="owner-section" aria-labelledby="assignment-heading">
      <Space direction="vertical" size={4}>
        <Link to="/labeler/tasks">Back to labeler tasks</Link>
        <Typography.Title id="assignment-heading" level={1}>
          Assignment workbench
        </Typography.Title>
        <Typography.Text type="secondary">{assignment.task.name}</Typography.Text>
      </Space>

      {error ? <Alert className="section-alert" message={error} type="error" /> : null}
      {isReturned ? (
        <Alert
          message="Returned submission revision"
          description={
            returnReason
              ? `This is attempt ${submission.attempt}. Reviewer reason: ${returnReason}`
              : `This is attempt ${submission.attempt}. Review the returned status and resubmit after correcting the annotation.`
          }
          type="warning"
          showIcon
        />
      ) : null}
      {versionMismatch ? (
        <Alert
          message="Template snapshot mismatch"
          description={`This submission references schema version ${submission.schema_version}, but the assignment response returned version ${template.version}.`}
          type="warning"
          showIcon
        />
      ) : null}

      <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
        <Descriptions.Item label="Assignment">{assignment.id}</Descriptions.Item>
        <Descriptions.Item label="Submission">{submission.id}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag>{submission.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Attempt">{submission.attempt}</Descriptions.Item>
        <Descriptions.Item label="Schema version">{submission.schema_version}</Descriptions.Item>
        <Descriptions.Item label="Autosave">
          <Tag color={autosaveState === "error" ? "red" : autosaveState === "saved" ? "green" : "blue"}>
            {autosaveState}
          </Tag>
        </Descriptions.Item>
      </Descriptions>

      <AgentWorkflowTimeline compact workflow={agentWorkflow} />

      <div className="workbench-grid">
        <section className="ops-card">
          <Typography.Title level={2}>Item payload</Typography.Title>
          <pre className="json-panel">{JSON.stringify(assignment.item.payload, null, 2)}</pre>
        </section>
        <section className="ops-card">
          <SchemaRenderer
            key={`${template.id}-${submission.id}`}
            schema={template.schema_payload}
            item={{
              id: assignment.item.id,
              external_id: assignment.item.external_id,
              payload: assignment.item.payload,
            }}
            initialAnswers={answers}
            onChange={handleChange}
            onSubmit={(nextAnswers) => void handleSubmit(nextAnswers)}
          />
          {submitting ? <Typography.Text type="secondary">Submitting current answers...</Typography.Text> : null}
        </section>
      </div>
    </section>
  );
}
