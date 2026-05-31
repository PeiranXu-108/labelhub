import { Alert, Button, Descriptions, Input, Modal, Result, Skeleton, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
import { normalizeError, useOperationMessage } from "../feedback";
import { formatLabel } from "../i18n/labels";
import { AssistantRail, JsonViewer, StudioPageHeader, StudioPanel, StatusPill } from "../studio";
import { TaskMetadataPanel } from "../task-metadata/TaskMetadataPanel";
import type { AgentWorkflowRead } from "../agent-workflow/types";
import { SchemaRenderer } from "../schema-renderer";
import type { AnswerPayload } from "../schema-renderer";
import {
  getAssignmentAgentWorkflow,
  getAssignmentNavigation,
  getAssignmentWithTemplate,
  navigateToNextAssignment,
  navigateToPreviousAssignment,
  saveAssignmentDraft,
  skipAssignment,
  submitAssignment,
} from "./api";
import type { AssignmentDetailRead, AssignmentNavigationMoveRead, AssignmentNavigationRead, SubmissionRead } from "./types";
import type { TemplateSchemaRead } from "../owner/types";

const AUTOSAVE_DEBOUNCE_MS = 900;

type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error";
type NavigationAction = "previous" | "next" | "skip";

function sameAnswers(left: AnswerPayload, right: AnswerPayload) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function LabelerWorkbench() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const showOperationError = useOperationMessage();
  const [assignment, setAssignment] = useState<AssignmentDetailRead | null>(null);
  const [template, setTemplate] = useState<TemplateSchemaRead | null>(null);
  const [submission, setSubmission] = useState<SubmissionRead | null>(null);
  const [navigationState, setNavigationState] = useState<AssignmentNavigationRead | null>(null);
  const [agentWorkflow, setAgentWorkflow] = useState<AgentWorkflowRead | null>(null);
  const [answers, setAnswers] = useState<AnswerPayload>({});
  const latestAnswers = useRef<AnswerPayload>({});
  const editedRef = useRef(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState<NavigationAction | null>(null);
  const [skipModalOpen, setSkipModalOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
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
      const [result, loadedNavigationState] = await Promise.all([
        getAssignmentWithTemplate(assignmentId),
        getAssignmentNavigation(assignmentId).catch(() => null),
      ]);
      setAssignment(result.assignment);
      setTemplate(result.template);
      setSubmission(result.assignment.submission);
      setNavigationState(loadedNavigationState);
      setAgentWorkflow(result.agentWorkflow);
      setAnswers(result.assignment.submission.answer_payload ?? {});
      latestAnswers.current = result.assignment.submission.answer_payload ?? {};
      editedRef.current = false;
      setAutosaveState("idle");
    } catch (err) {
      setError(normalizeError(err, "加载作业失败。"));
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
          showOperationError(err, "自动保存草稿失败。");
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

  async function saveDraftBeforeNavigation() {
    if (!assignmentId || !editedRef.current) {
      return true;
    }
    const snapshot = latestAnswers.current;
    setAutosaveState("saving");
    try {
      const saved = await saveAssignmentDraft(assignmentId, snapshot);
      setSubmission(saved);
      setAnswers(saved.answer_payload);
      latestAnswers.current = saved.answer_payload;
      editedRef.current = false;
      setAutosaveState("saved");
      return true;
    } catch (err) {
      showOperationError(err, "离开前保存草稿失败。");
      setAutosaveState("error");
      return window.confirm("草稿保存失败，仍要离开当前作业吗？未保存更改会丢失。");
    }
  }

  function applyNavigationResult(result: AssignmentNavigationMoveRead) {
    if (!result.assignment) {
      setNavigationState((current) =>
        current
          ? {
              ...current,
              previous_assignment_id: result.direction === "previous" ? null : current.previous_assignment_id,
              next_assignment_id: result.direction === "previous" ? current.next_assignment_id : null,
              can_claim_next: result.direction === "previous" ? current.can_claim_next : false,
              has_previous: result.direction === "previous" ? false : current.has_previous,
              has_next: result.direction === "previous" ? current.has_next : false,
              no_work_left: result.no_work_left,
            }
          : null,
      );
      return;
    }
    navigate(`/labeler/assignments/${result.assignment.id}`);
  }

  async function handleNavigate(direction: Exclude<NavigationAction, "skip">) {
    if (!assignmentId) {
      return;
    }
    setNavigating(direction);
    try {
      const canLeave = await saveDraftBeforeNavigation();
      if (!canLeave) {
        return;
      }
      const result =
        direction === "previous"
          ? await navigateToPreviousAssignment(assignmentId)
          : await navigateToNextAssignment(assignmentId);
      applyNavigationResult(result);
    } catch (err) {
      showOperationError(err, direction === "previous" ? "加载上一个作业失败。" : "加载下一个作业失败。");
    } finally {
      setNavigating(null);
    }
  }

  async function handleSkipConfirm() {
    if (!assignmentId) {
      return;
    }
    setNavigating("skip");
    try {
      const canLeave = await saveDraftBeforeNavigation();
      if (!canLeave) {
        return;
      }
      const result = await skipAssignment(assignmentId, skipReason.trim() || null);
      setSkipModalOpen(false);
      setSkipReason("");
      applyNavigationResult(result);
    } catch (err) {
      showOperationError(err, "跳过作业失败。");
    } finally {
      setNavigating(null);
    }
  }

  async function handleSubmit(nextAnswers: AnswerPayload) {
    if (!assignmentId) {
      return;
    }
    setSubmitting(true);
    try {
      const saved = await submitAssignment(assignmentId, nextAnswers);
      setSubmission(saved);
      setAgentWorkflow(await getAssignmentAgentWorkflow(assignmentId).catch(() => null));
      setAnswers(saved.answer_payload);
      latestAnswers.current = saved.answer_payload;
      editedRef.current = false;
      setAutosaveState("saved");
    } catch (err) {
      showOperationError(err, "提交作业失败。");
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
  const returnStage = assignment.latest_human_review?.stage ?? submission.review_stage;
  const hasPrevious = Boolean(navigationState?.has_previous);
  const hasNext = Boolean(navigationState?.has_next);
  const navigationBusy = navigating !== null;

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
          actions={
            <Space wrap>
              <Button
                disabled={!hasPrevious || navigationBusy}
                loading={navigating === "previous"}
                onClick={() => void handleNavigate("previous")}
              >
                上一个
              </Button>
              <Button
                disabled={!hasNext || navigationBusy}
                loading={navigating === "next"}
                type="primary"
                onClick={() => void handleNavigate("next")}
              >
                下一个
              </Button>
              <Button danger disabled={navigationBusy || submitting} onClick={() => setSkipModalOpen(true)}>
                跳过
              </Button>
            </Space>
          }
        />

        {navigationState?.no_work_left ? (
          <Alert message="没有更多可标注的数据项。" type="info" showIcon />
        ) : null}
        {isReturned ? (
          <Alert
            message={`${returnStage ? formatLabel(returnStage) : "人工审核"}退回提交修订`}
            description={
              returnReason
                ? `这是第 ${submission.attempt} 次尝试。${returnStage ? `${formatLabel(returnStage)}退回` : "审核员"}原因：${returnReason}`
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

        <TaskMetadataPanel task={assignment.task} />

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
              assistContext={{ assignmentId: assignment.id }}
              uploadContext={{ assignmentId: assignment.id }}
              onChange={handleChange}
              onSubmit={(nextAnswers) => void handleSubmit(nextAnswers)}
            />
            {submitting ? <Typography.Text type="secondary">正在提交当前答案...</Typography.Text> : null}
          </StudioPanel>
        </div>
      </div>
      <Modal footer={null} open={skipModalOpen} title="跳过当前作业" onCancel={() => setSkipModalOpen(false)}>
        <Space className="modal-stack" direction="vertical">
          <Typography.Text type="secondary">
            跳过会保留当前草稿并记录审计日志，不会提交此标注。
          </Typography.Text>
          <Input.TextArea
            aria-label="跳过原因"
            autoSize={{ minRows: 3 }}
            placeholder="可选：说明为什么跳过"
            value={skipReason}
            onChange={(event) => setSkipReason(event.target.value)}
          />
          <div className="drawer-actions">
            <Button onClick={() => setSkipModalOpen(false)}>取消</Button>
            <Button danger loading={navigating === "skip"} type="primary" onClick={() => void handleSkipConfirm()}>
              确认跳过
            </Button>
          </div>
        </Space>
      </Modal>
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
