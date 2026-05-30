import { Alert, Button, Descriptions, Result, Skeleton, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
import { formatLabel } from "../i18n/labels";
import { AssistantRail, JsonViewer, StudioPageHeader, StudioPanel, StatusPill } from "../studio";
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
      setError("路由中缺少作业 ID。");
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
      setError(err instanceof Error ? err.message : "加载作业失败。");
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
          setError(err instanceof Error ? err.message : "自动保存草稿失败。");
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
      setError(err instanceof Error ? err.message : "提交作业失败。");
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
        <Alert action={<Button onClick={load}>重试</Button>} message={error} type="error" />
      </section>
    );
  }

  if (!assignment || !template || !submission) {
    return (
      <Result
        status="warning"
        title="作业不可用"
        extra={<Link to="/labeler/tasks">返回标注任务</Link>}
      />
    );
  }

  const versionMismatch = template.version !== submission.schema_version;
  const isReturned = submission.status === "returned" || submission.status === "ai_returned";
  const returnReason = assignment.latest_human_review?.reason;

  return (
    <section className="studio-with-rail" aria-labelledby="assignment-heading">
      <div className="studio-main-column">
        <StudioPageHeader
          title={<span id="assignment-heading">标注工作台</span>}
          description={assignment.task.name}
          backLink={<Link to="/labeler/tasks">返回标注任务</Link>}
          meta={
            <Space wrap>
              <StatusPill status={submission.status}>{formatLabel(submission.status)}</StatusPill>
              <StatusPill status={autosaveState}>{formatLabel(autosaveState)}</StatusPill>
            </Space>
          }
        />

        {error ? <Alert className="section-alert" message={error} type="error" /> : null}
        {isReturned ? (
          <Alert
            message="退回提交修订"
            description={
              returnReason
                ? `这是第 ${submission.attempt} 次尝试。审核员原因：${returnReason}`
                : `这是第 ${submission.attempt} 次尝试。请查看退回状态，修正标注后重新提交。`
            }
            type="warning"
            showIcon
          />
        ) : null}
        {versionMismatch ? (
          <Alert
            message="模板快照不匹配"
            description={`此提交引用的是 schema 版本 ${submission.schema_version}，但作业响应返回的是版本 ${template.version}。`}
            type="warning"
            showIcon
          />
        ) : null}

        <StudioPanel>
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="作业">{assignment.id}</Descriptions.Item>
            <Descriptions.Item label="提交">{submission.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag>{formatLabel(submission.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="尝试次数">{submission.attempt}</Descriptions.Item>
            <Descriptions.Item label="Schema 版本">{submission.schema_version}</Descriptions.Item>
            <Descriptions.Item label="自动保存">
              <Tag color={autosaveState === "error" ? "red" : autosaveState === "saved" ? "green" : "blue"}>
                {formatLabel(autosaveState)}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </StudioPanel>

        <AgentWorkflowTimeline compact workflow={agentWorkflow} />

        <div className="workbench-grid">
          <StudioPanel title="数据项内容">
            <JsonViewer value={assignment.item.payload} />
          </StudioPanel>
          <StudioPanel>
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
            {submitting ? <Typography.Text type="secondary">正在提交当前答案...</Typography.Text> : null}
          </StudioPanel>
        </div>
      </div>
      <AssistantRail
        context="标注工作台助手会关注退回原因、必填字段、Schema 版本和自动保存状态。"
        facts={[
          { label: "尝试次数", value: submission.attempt },
          { label: "Schema", value: submission.schema_version },
          { label: "自动保存", value: formatLabel(autosaveState) },
        ]}
      />
    </section>
  );
}
