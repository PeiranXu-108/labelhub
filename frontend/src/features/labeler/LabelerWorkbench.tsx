import { Alert, Button, Descriptions, Input, List, Modal, Progress, Select, Result, Skeleton, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AgentWorkflowTimeline } from "../agent-workflow/AgentWorkflowTimeline";
import { normalizeError, useOperationMessage } from "../feedback";
import { formatLabel } from "../i18n/labels";
import { JsonViewer, StudioPageHeader, StudioPanel, StatusPill } from "../studio";
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
  reportAssignmentProblem,
  saveAssignmentDraft,
  skipAssignment,
  submitAssignment,
} from "./api";
import type {
  AssignmentDetailRead,
  AssignmentNavigationItemRead,
  AssignmentNavigationMoveRead,
  AssignmentNavigationRead,
  SubmissionRead,
} from "./types";
import type { TemplateSchemaRead } from "../owner/types";

const AUTOSAVE_DEBOUNCE_MS = 900;

type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error";
type NavigationAction = "previous" | "next" | "skip";

function sameAnswers(left: AnswerPayload, right: AnswerPayload) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName.toLowerCase();
  if (["input", "textarea", "select"].includes(tagName)) {
    return true;
  }
  return Boolean(target.closest("[contenteditable='true'], .ant-select, .ant-input, .ant-input-number"));
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
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("bad_source");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const schemaRendererRef = useRef<HTMLDivElement | null>(null);
  const hasPrevious = Boolean(navigationState?.has_previous);
  const hasNext = Boolean(navigationState?.has_next);
  const navigationBusy = navigating !== null;

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
      setReportSuccess(null);
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

  async function persistCurrentDraft(errorMessage: string) {
    if (!assignmentId) {
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
      showOperationError(err, errorMessage);
      setAutosaveState("error");
      throw err;
    }
  }

  async function handleSaveDraft() {
    try {
      await persistCurrentDraft("保存草稿失败。");
    } catch {
      // Error message is already surfaced through the operation message hook.
    }
  }

  async function saveDraftBeforeNavigation() {
    if (!assignmentId || !editedRef.current) {
      return true;
    }
    try {
      return await persistCurrentDraft("离开前保存草稿失败。");
    } catch {
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

  async function handleReportProblem() {
    if (!assignmentId || !reportNote.trim()) {
      return;
    }
    setReporting(true);
    try {
      await reportAssignmentProblem(assignmentId, reportCategory, reportNote.trim());
      setReportModalOpen(false);
      setReportNote("");
      setReportCategory("bad_source");
      setReportSuccess("问题已记录。");
      const refreshedNavigationState = await getAssignmentNavigation(assignmentId).catch(() => null);
      if (refreshedNavigationState) {
        setNavigationState(refreshedNavigationState);
      }
    } catch (err) {
      showOperationError(err, "报告问题失败。");
    } finally {
      setReporting(false);
    }
  }

  async function handleNavigationItemClick(item: AssignmentNavigationItemRead) {
    if (!item.is_navigable || item.is_current) {
      return;
    }
    if (item.navigation_action === "next") {
      await handleNavigate("next");
      return;
    }
    if (!item.assignment_id) {
      return;
    }
    const canLeave = await saveDraftBeforeNavigation();
    if (canLeave) {
      navigate(`/labeler/assignments/${item.assignment_id}`);
    }
  }

  async function handleSubmit(nextAnswers: AnswerPayload) {
    if (!assignmentId) {
      return;
    }
    setSubmitting(true);
    try {
      const saved = await submitAssignment(assignmentId, nextAnswers);
      const [refreshedAgentWorkflow, refreshedNavigationState] = await Promise.all([
        getAssignmentAgentWorkflow(assignmentId).catch(() => null),
        getAssignmentNavigation(assignmentId).catch(() => null),
      ]);
      setSubmission(saved);
      setAgentWorkflow(refreshedAgentWorkflow);
      if (refreshedNavigationState) {
        setNavigationState(refreshedNavigationState);
      }
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

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }
      if (skipModalOpen || reportModalOpen) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        void handleSaveDraft();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        const submitButton = schemaRendererRef.current?.querySelector(
          ".schema-renderer > .ant-btn-primary",
        ) as HTMLButtonElement | null;
        submitButton?.click();
        return;
      }
      if (event.altKey && event.key === "ArrowLeft" && navigationState?.has_previous && !navigationBusy) {
        event.preventDefault();
        void handleNavigate("previous");
        return;
      }
      if (event.altKey && event.key === "ArrowRight" && navigationState?.has_next && !navigationBusy) {
        event.preventDefault();
        void handleNavigate("next");
        return;
      }
      if (event.altKey && key === "r") {
        event.preventDefault();
        setReportModalOpen(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

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
  const currentPosition = navigationState?.current_position ?? null;
  const totalCount = navigationState?.total_count ?? null;

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
              <Button disabled={submitting || navigationBusy} onClick={() => void handleSaveDraft()}>
                保存草稿
              </Button>
              <Button disabled={submitting || navigationBusy} onClick={() => setReportModalOpen(true)}>
                报告问题
              </Button>
              <Button danger disabled={navigationBusy || submitting} onClick={() => setSkipModalOpen(true)}>
                跳过
              </Button>
            </Space>
          }
        />

        {reportSuccess ? <Alert message={reportSuccess} type="success" showIcon /> : null}
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

        <div className="workbench-productivity-grid">
          <StudioPanel title="作业导航" className="ops-card">
            {currentPosition && totalCount ? (
              <Space className="workbench-progress" direction="vertical">
                <Space wrap>
                  <Typography.Text strong>{`${currentPosition} / ${totalCount}`}</Typography.Text>
                  <Typography.Text type="secondary">当前任务进度</Typography.Text>
                </Space>
                <Progress
                  percent={Math.round((currentPosition / Math.max(totalCount, 1)) * 100)}
                  showInfo={false}
                  size="small"
                />
              </Space>
            ) : (
              <Typography.Text type="secondary">导航信息暂不可用</Typography.Text>
            )}
            <List
              className="assignment-nav-list"
              dataSource={navigationState?.items ?? []}
              locale={{ emptyText: "暂无可显示的作业" }}
              renderItem={(item) => (
                <List.Item>
                  <Button
                    block
                    className="assignment-nav-item"
                    disabled={!item.is_navigable || item.is_current || navigationBusy}
                    type={item.is_current ? "primary" : "default"}
                    onClick={() => void handleNavigationItemClick(item)}
                  >
                    <span>{`#${item.position}`}</span>
                    <span>{item.external_id ?? item.item_id}</span>
                    <Tag>{formatLabel(item.status)}</Tag>
                  </Button>
                </List.Item>
              )}
            />
          </StudioPanel>

          <StudioPanel title="我的贡献" className="ops-card">
            {navigationState?.contribution ? (
              <Space className="contribution-summary" wrap>
                <Tag>{`草稿/进行中 ${navigationState.contribution.draft_count}`}</Tag>
                <Tag>{`已提交 ${navigationState.contribution.submitted_count}`}</Tag>
                <Tag>{`通过/批准 ${navigationState.contribution.approved_passed_count}`}</Tag>
                <Tag>{`退回/拒绝 ${navigationState.contribution.returned_rejected_count}`}</Tag>
                <Tag>{`我的作业 ${navigationState.contribution.total_owned_count}`}</Tag>
              </Space>
            ) : (
              <Typography.Text type="secondary">贡献统计暂不可用</Typography.Text>
            )}
          </StudioPanel>

          <StudioPanel title="当前作业历史" className="ops-card">
            <List
              className="assignment-history-list"
              dataSource={navigationState?.history ?? []}
              locale={{ emptyText: "暂无历史记录" }}
              renderItem={(event) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Space wrap>
                      <Typography.Text strong>{event.title}</Typography.Text>
                      <Tag>{formatLabel(event.actor_role)}</Tag>
                    </Space>
                    {event.summary ? <Typography.Text type="secondary">{event.summary}</Typography.Text> : null}
                    <Typography.Text type="secondary">{new Date(event.created_at).toLocaleString()}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </StudioPanel>

          <StudioPanel title="快捷键" className="ops-card">
            <div className="shortcut-grid">
              <Typography.Text>Ctrl/⌘ + S</Typography.Text>
              <Typography.Text>保存草稿</Typography.Text>
              <Typography.Text>Ctrl/⌘ + Enter</Typography.Text>
              <Typography.Text>提交</Typography.Text>
              <Typography.Text>Alt + ←</Typography.Text>
              <Typography.Text>上一个</Typography.Text>
              <Typography.Text>Alt + →</Typography.Text>
              <Typography.Text>下一个</Typography.Text>
              <Typography.Text>Alt + R</Typography.Text>
              <Typography.Text>报告问题</Typography.Text>
            </div>
          </StudioPanel>
        </div>

        <div className="workbench-grid">
          <StudioPanel title="数据项内容">
            <JsonViewer value={assignment.item.payload} />
          </StudioPanel>
          <StudioPanel>
            <div ref={schemaRendererRef}>
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
            </div>
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
      <Modal footer={null} open={reportModalOpen} title="报告问题" onCancel={() => setReportModalOpen(false)}>
        <Space className="modal-stack" direction="vertical">
          <Typography.Text type="secondary">
            报告只记录当前数据项问题，不会提交答案，也不会改变作业状态。
          </Typography.Text>
          <Select
            aria-label="问题类别"
            options={[
              { label: "数据源问题", value: "bad_source" },
              { label: "模板问题", value: "template_issue" },
              { label: "其他问题", value: "other" },
            ]}
            value={reportCategory}
            onChange={setReportCategory}
          />
          <Input.TextArea
            aria-label="问题说明"
            autoSize={{ minRows: 4 }}
            placeholder="说明当前数据项的问题"
            value={reportNote}
            onChange={(event) => setReportNote(event.target.value)}
          />
          <div className="drawer-actions">
            <Button onClick={() => setReportModalOpen(false)}>取消</Button>
            <Button
              disabled={!reportNote.trim()}
              loading={reporting}
              type="primary"
              onClick={() => void handleReportProblem()}
            >
              提交报告
            </Button>
          </div>
        </Space>
      </Modal>
    </section>
  );
}
