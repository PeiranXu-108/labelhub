# LabelHub API Reference

本文是 LabelHub 当前 API 的 Markdown 交付文档，可直接复制到飞书文档或作为联调说明使用。

运行时 source of truth 是 FastAPI 暴露的 `GET /openapi.json`。仓库内稳定快照为 `frontend/src/api/openapi.json`，本文按该快照整理。接口行为说明同时参考后端路由实现。

## 1. API 概览

### 1.1 Base URL

本地开发默认地址：

```text
http://localhost:8000
```

Docker Compose demo 默认地址：

```text
http://localhost:8000
```

前端通过 `VITE_API_BASE_URL` 指向 API 服务。FastAPI 当前没有 `/api/v1` 路由前缀，接口路径直接从根路径开始，例如 `/auth/login`、`/tasks`。

### 1.2 认证方式

除 `GET /health` 和 `POST /auth/login` 外，业务接口均使用 JWT Bearer token。

请求头格式：

```http
Authorization: Bearer <access_token>
```

Token 必须包含：

- `sub`：持久化用户 ID。
- `role`：`owner`、`labeler`、`reviewer` 或 `ai_agent`。

后端会校验 token subject 对应的用户存在，并校验 token role 与用户角色一致。不会因为 bearer token 自动创建用户。

### 1.3 Demo 用户

先写入 demo 用户：

```bash
cd backend
python scripts/seed_e2e_data.py demo-users
```

默认账号：

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 负责人 | `owner@example.com` | `LabelHubOwner123!` |
| 标注员 | `labeler@example.com` | `LabelHubLabeler123!` |
| 审核员 | `reviewer@example.com` | `LabelHubReviewer123!` |

### 1.4 快速开始

登录：

```bash
curl -s http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"LabelHubOwner123!"}'
```

响应 schema：`LoginResponse`。

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer",
  "user": {
    "id": "user-id",
    "email": "owner@example.com",
    "name": "Owner",
    "role": "owner"
  }
}
```

带 token 调用业务接口：

```bash
TOKEN="<access_token>"
curl -s http://localhost:8000/tasks \
  -H "Authorization: Bearer $TOKEN"
```

### 1.5 通用错误

FastAPI/Pydantic 参数校验失败返回 `422`，schema 为 `HTTPValidationError`。

业务错误通常返回如下结构：

```json
{
  "detail": {
    "code": "PERMISSION_DENIED",
    "message": "This role is not allowed to perform the requested action",
    "extra": {}
  }
}
```

常见状态码：

| 状态码 | 含义 |
|---|---|
| `400` | 请求语义不合法、状态流转不允许、业务校验失败 |
| `401` | 未登录、token 无效、登录凭证错误 |
| `403` | 当前角色或当前用户无权访问资源 |
| `404` | 资源不存在 |
| `409` | 资源当前状态不允许执行操作，例如导出未就绪、AI retry 条件不满足 |
| `422` | 请求参数或请求体不符合 schema |

### 1.6 角色缩写

| 文档标记 | 后端角色 |
|---|---|
| Owner | `owner` |
| Labeler | `labeler` |
| Reviewer | `reviewer` |
| AI Agent | `ai_agent`，系统审计角色，不用于普通前端登录 |

## 2. 接口目录

### 2.1 Health / Auth

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| GET | `/health` | Public | 服务健康检查 |
| POST | `/auth/login` | Public | 用户登录并返回 JWT |
| GET | `/auth/me` | Owner / Labeler / Reviewer | 获取当前用户 |

### 2.2 Owner Tasks / Metrics / Import / Review Config

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| GET | `/tasks` | Owner / Reviewer | 查询任务列表 |
| POST | `/tasks` | Owner | 创建任务 |
| GET | `/tasks/metrics` | Owner / Reviewer | 查询任务列表聚合指标 |
| GET | `/tasks/{task_id}` | Owner / Reviewer / Labeler | 读取任务详情 |
| PATCH | `/tasks/{task_id}` | Owner | 更新任务可编辑字段 |
| GET | `/tasks/{task_id}/metrics` | Owner / Reviewer | 查询单任务指标 |
| GET | `/tasks/{task_id}/agent-workflow` | Owner / Reviewer | 查询任务级 Agent 工作流汇总 |
| POST | `/tasks/{task_id}/publish` | Owner | 发布任务 |
| POST | `/tasks/{task_id}/pause` | Owner | 暂停任务 |
| POST | `/tasks/{task_id}/end` | Owner | 结束任务 |
| POST | `/tasks/{task_id}/items/import/preview` | Owner | 预览并校验导入数据 |
| POST | `/tasks/{task_id}/items/import` | Owner | 提交导入数据 |
| GET | `/tasks/{task_id}/items` | Owner / Reviewer | 查询任务数据项 |
| GET | `/tasks/{task_id}/review-config` | Owner / Reviewer | 读取 AI 审核配置 |
| PUT | `/tasks/{task_id}/review-config` | Owner | 新建或更新 AI 审核配置 |

### 2.3 Template

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| GET | `/tasks/{task_id}/template` | Owner / Reviewer / Labeler | 读取任务最新模板 |
| POST | `/tasks/{task_id}/template/draft` | Owner | 保存模板草稿 |
| POST | `/tasks/{task_id}/template/publish` | Owner | 发布当前模板草稿 |

### 2.4 Labeler

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| GET | `/labeler/tasks` | Labeler | 查询可认领任务市场 |
| POST | `/labeler/tasks/{task_id}/claim` | Labeler | 认领一个可用数据项 |
| GET | `/labeler/assignments/{assignment_id}` | Labeler | 读取自己的 assignment 详情 |
| GET | `/labeler/assignments/{assignment_id}/navigation` | Labeler | 查询 assignment 导航状态 |
| POST | `/labeler/assignments/{assignment_id}/previous` | Labeler | 跳到上一个 assignment |
| POST | `/labeler/assignments/{assignment_id}/next` | Labeler | 跳到下一个 assignment 或尝试领取后续项 |
| POST | `/labeler/assignments/{assignment_id}/skip` | Labeler | 跳过当前 assignment |
| POST | `/labeler/assignments/{assignment_id}/problem-reports` | Labeler | 上报当前 assignment 问题 |
| GET | `/labeler/assignments/{assignment_id}/agent-workflow` | Labeler | 查询自己的提交 Agent 工作流 |
| POST | `/labeler/assignments/{assignment_id}/llm-assist` | Labeler | 调用模板内 LLM 字段辅助 |
| PUT | `/labeler/assignments/{assignment_id}/draft` | Labeler | 保存草稿答案 |
| POST | `/labeler/assignments/{assignment_id}/submit` | Labeler | 提交答案 |
| GET | `/labeler/submissions` | Labeler | 查询自己的提交列表 |
| POST | `/labeler/assignments/{assignment_id}/uploads` | Labeler | 上传 assignment 字段附件 |

### 2.5 Review

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| GET | `/review/metrics` | Reviewer | 查询审核员工作台指标 |
| GET | `/review/queue` | Reviewer | 查询审核队列 |
| GET | `/review/submissions/{submission_id}` | Reviewer | 读取审核详情 |
| POST | `/review/submissions/{submission_id}/approve` | Reviewer | 批准提交 |
| POST | `/review/submissions/{submission_id}/return` | Reviewer | 退回提交 |
| POST | `/review/submissions/batch` | Reviewer | 批量批准或退回 |
| GET | `/review/submissions/{submission_id}/audit-export` | Owner / Reviewer | 导出单提交审核审计 |
| GET | `/review/tasks/{task_id}/audit-export` | Owner / Reviewer | 导出任务审核审计 |

### 2.6 AI Operations

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| GET | `/ai-operations/runs` | Owner / Reviewer | 查询 AI 审核运行列表 |
| GET | `/ai-operations/runs/{submission_id}` | Owner / Reviewer | 查询单次 AI 审核运行详情 |
| POST | `/ai-operations/runs/{submission_id}/retry` | Owner / Reviewer | 重试失败的 AI 审核 |

### 2.7 Exports / Upload Downloads / Audit

| Method | Path | 角色 | 用途 |
|---|---|---|---|
| POST | `/tasks/{task_id}/exports` | Owner | 创建导出任务 |
| GET | `/tasks/{task_id}/exports` | Owner / Reviewer | 查询导出任务 |
| GET | `/exports/{export_job_id}/download` | Owner / Reviewer | 下载导出文件 |
| GET | `/uploads/{asset_id}/download` | Owner / Labeler / Reviewer | 下载上传附件 |
| GET | `/audit` | Owner / Reviewer | 查询审计日志 |

## 3. Health / Auth

### GET `/health`

公开健康检查。

响应：

```json
{ "status": "ok" }
```

### POST `/auth/login`

请求 schema：`LoginRequest`。

```json
{
  "email": "owner@example.com",
  "password": "LabelHubOwner123!"
}
```

响应 schema：`LoginResponse`。

无效账号或密码返回 `401`，错误码 `INVALID_CREDENTIALS`。

### GET `/auth/me`

返回当前持久化用户摘要，schema：`UserSummary`。

## 4. Owner Tasks / Metrics / Dataset Import / Review Config

### GET `/tasks`

角色：Owner / Reviewer。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `search` | string | 按任务文本搜索 |
| `status` | `TaskStatus` | 任务状态筛选 |
| `distribution_strategy` | `manual` / `auto_claim` | 分发策略筛选 |

响应 schema：`TaskRead[]`。

### POST `/tasks`

角色：Owner。

请求 schema：`TaskCreate`。

```json
{
  "name": "Customer support QA",
  "description": "Label support conversations for model training.",
  "instruction_rich_text": {
    "format": "markdown",
    "content": "Read the source text and provide a structured judgment."
  },
  "tags": ["support qa", "priority"],
  "reward_rule": {
    "mode": "fixed_per_accepted_submission",
    "currency": "USD",
    "amount": "1.25",
    "description": "Paid after accepted submission."
  },
  "quality_rules": [
    { "label": "Evidence", "description": "Cite the source text." }
  ],
  "distribution_strategy": "auto_claim",
  "quota_per_labeler": 50,
  "deadline_at": "2026-06-30T23:59:59Z"
}
```

响应 schema：`TaskRead`，状态码 `201`。

说明：

- `instruction_rich_text` 仅支持安全 markdown，拒绝 HTML 标签、`javascript:`、HTML data URL 和 inline event handler。
- `tags` 会 trim、折叠空白、转小写，并按规范化结果去重。
- `reward_rule` 只做元数据校验，不触发支付、结算或账务行为。

### GET `/tasks/metrics`

角色：Owner / Reviewer。

查询参数与 `GET /tasks` 相同。响应 schema：`TaskListMetricsRead`，包含整体 summary 和每个任务的 `TaskMetricRead`。

### GET `/tasks/{task_id}`

角色：Owner / Reviewer / Labeler。

响应 schema：`TaskRead`。任务不存在返回 `TASK_NOT_FOUND`。

### PATCH `/tasks/{task_id}`

角色：Owner。

请求 schema：`TaskUpdate`，字段与 `TaskCreate` 基本一致，均为可选。响应 schema：`TaskRead`。

### GET `/tasks/{task_id}/metrics`

角色：Owner / Reviewer。

响应 schema：`TaskMetricRead`。

关键字段：

- `item_count`
- `submitted_count`
- `current_week_submitted_count`
- `progress_percent`
- `submission_status_counts`
- `ai_decision_counts`

### GET `/tasks/{task_id}/agent-workflow`

角色：Owner / Reviewer。

响应 schema：`TaskAgentWorkflowSummaryRead`。用于任务级 Agent 工作流看板，包含状态计数、AI 决策计数、pending/failed 计数和近期 submission 工作流。

### POST `/tasks/{task_id}/publish`

角色：Owner。

发布任务，响应 schema：`TaskRead`。状态流转由后端工作流服务校验。

### POST `/tasks/{task_id}/pause`

角色：Owner。

暂停已发布任务，响应 schema：`TaskRead`。

### POST `/tasks/{task_id}/end`

角色：Owner。

结束任务，响应 schema：`TaskRead`。

### POST `/tasks/{task_id}/items/import/preview`

角色：Owner。

请求 schema：`ItemImportPreviewRequest`。

```json
{
  "format": "jsonl",
  "content": "{\"external_id\":\"row-1\",\"payload\":{\"text\":\"Hello\"}}\n",
  "filename": "sample.jsonl",
  "is_base64": false,
  "excel_mapping": {
    "external_id_column": "external_id",
    "payload_column": "payload",
    "payload_columns": null
  }
}
```

响应 schema：`ItemImportPreviewResponse`，包含：

- `rows`
- `valid_count`
- `invalid_count`
- `limits`
- 行级 `errors` / `warnings`

支持格式：

- `json_array`
- `jsonl`
- `xlsx`

限制默认值：

- `LABELHUB_IMPORT_MAX_ROWS=5000`
- `LABELHUB_IMPORT_MAX_FILE_BYTES=5242880`

### POST `/tasks/{task_id}/items/import`

角色：Owner。

请求 schema：`ItemImportRequest`。

```json
{
  "items": [
    {
      "external_id": "row-1",
      "payload": { "text": "Hello" },
      "source_row": 1
    }
  ]
}
```

响应 schema：`TaskItemRead[]`，状态码 `201`。

导入提交采用 all-or-nothing 策略。非空 `external_id` 必须在任务内和本次提交批次内唯一；`external_id: null` 允许重复。

### GET `/tasks/{task_id}/items`

角色：Owner / Reviewer。

响应 schema：`TaskItemRead[]`。

### GET `/tasks/{task_id}/review-config`

角色：Owner / Reviewer。

响应 schema：`ReviewConfigRead`。未配置时返回 `404`，错误码 `REVIEW_CONFIG_NOT_FOUND`。

### PUT `/tasks/{task_id}/review-config`

角色：Owner。

请求 schema：`ReviewConfigUpsert`。

```json
{
  "prompt_template": "Review the answer against the task criteria.",
  "criteria": [
    { "name": "accuracy", "description": "Answer matches source text.", "weight": 1 }
  ],
  "pass_threshold": 80,
  "return_threshold": 40,
  "manual_review_threshold": 60,
  "model_name": "deepseek-chat",
  "temperature": 0,
  "max_retries": 1
}
```

响应 schema：`ReviewConfigRead`。

## 5. Template Draft / Publish

### GET `/tasks/{task_id}/template`

角色：Owner / Reviewer / Labeler。

读取任务最新模板，响应 schema：`TemplateSchemaRead`。

### POST `/tasks/{task_id}/template/draft`

角色：Owner。

请求 schema：`TemplateDraftRequest`。

```json
{
  "schema": {
    "version": 1,
    "title": "Support quality labeling",
    "layout": {
      "type": "single",
      "groups": []
    },
    "fields": [
      {
        "id": "raw_text",
        "type": "show_item",
        "label": "Original text",
        "source": "item.payload.text"
      },
      {
        "id": "sentiment",
        "type": "radio",
        "label": "Sentiment",
        "required": true,
        "options": [
          { "label": "Positive", "value": "positive" },
          { "label": "Neutral", "value": "neutral" },
          { "label": "Negative", "value": "negative" }
        ]
      }
    ],
    "validations": [],
    "visibilityRules": []
  }
}
```

响应 schema：`TemplateSchemaRead`，状态码 `201`。

### POST `/tasks/{task_id}/template/publish`

角色：Owner。

发布当前草稿，响应 schema：`TemplateSchemaRead`。

说明：

- 已发布模板 schema 不可变。
- 标注提交会保存 `template_schema_id` 和 `schema_version`。
- 提交和审核使用冻结模板快照，不使用之后的模板草稿。

支持的主要字段 schema：

- `ShowItemField`
- `TextField`
- `TextareaField`
- `NumberField`
- `RadioField`
- `CheckboxGroupField`
- `SelectField`
- `RatingField`
- `JsonField`
- `RichTextField`
- `ImageUploadField`
- `FileUploadField`
- `LlmTriggerField`

上传字段会校验 MIME、扩展名、文件大小、数量和 assignment 归属。富文本字段只接受安全 markdown。

## 6. Labeler APIs

### GET `/labeler/tasks`

角色：Labeler。

返回可认领任务市场，响应 schema：`TaskRead[]`。

只返回：

- `published` 状态任务。
- 仍存在未分配数据项的任务。
- 已发布模板的任务。

### POST `/labeler/tasks/{task_id}/claim`

角色：Labeler。

认领任务中的下一个可用数据项。响应 schema：`ClaimRead`，状态码 `201`。

没有可认领数据时返回业务错误 `NO_AVAILABLE_ITEMS`。

### GET `/labeler/assignments/{assignment_id}`

角色：Labeler。

只能读取自己的 assignment。响应 schema：`AssignmentDetailRead`，包含：

- assignment 基本信息
- task
- item
- submission
- 冻结 template schema
- latest human review

### GET `/labeler/assignments/{assignment_id}/navigation`

角色：Labeler。

响应 schema：`AssignmentNavigationRead`。用于标注工作台左侧/顶部导航，包含上一条、下一条、是否可继续领取、当前位置、贡献统计和历史事件。

### POST `/labeler/assignments/{assignment_id}/previous`

角色：Labeler。

跳到上一个 assignment。响应 schema：`AssignmentNavigationMoveRead`。

当没有上一条时，`assignment` 为 `null`，`message` 为无上一条语义。

### POST `/labeler/assignments/{assignment_id}/next`

角色：Labeler。

跳到下一个 assignment 或尝试领取后续工作。响应 schema：`AssignmentNavigationMoveRead`。

当任务队列没有剩余工作时，`no_work_left` 为 `true`。

### POST `/labeler/assignments/{assignment_id}/skip`

角色：Labeler。

请求 schema：`SkipAssignmentRequest`。

```json
{
  "reason": "Source text is unreadable."
}
```

响应 schema：`AssignmentNavigationMoveRead`，包含被跳过 assignment ID、skip reason 和下一条 assignment。

### POST `/labeler/assignments/{assignment_id}/problem-reports`

角色：Labeler。

请求 schema：`ProblemReportRequest`。

```json
{
  "category": "bad_source",
  "note": "The item payload is missing the text field."
}
```

响应 schema：`ProblemReportRead`，状态码 `201`。问题报告会进入审计记录。

### GET `/labeler/assignments/{assignment_id}/agent-workflow`

角色：Labeler。

读取该 assignment 对应 submission 的 Agent 工作流。响应 schema：`AgentWorkflowRead`。

### POST `/labeler/assignments/{assignment_id}/llm-assist`

角色：Labeler。

请求 schema：`LLMFieldAssistRequest`。

```json
{
  "trigger_field_id": "assist_summary",
  "answer_payload": {
    "sentiment": "positive",
    "summary": "Current draft value"
  }
}
```

响应 schema：`LLMFieldAssistResponse`。

```json
{
  "log_id": "assist-log-id",
  "trigger_field_id": "assist_summary",
  "target_field_id": "summary",
  "mode": "prefill",
  "status": "succeeded",
  "value": "Suggested field value",
  "rationale": "Optional model rationale",
  "confidence": 0.91,
  "model_name": "deepseek-chat",
  "created_at": "2026-06-10T00:00:00Z"
}
```

说明：

- Prompt 由后端基于冻结模板、item payload、当前答案、目标字段和 context fields 构造。
- Provider key 不会进入模板 JSON 或前端代码。
- 缺失 provider credential 时返回受控错误 `LLM_PROVIDER_UNAVAILABLE`。

### PUT `/labeler/assignments/{assignment_id}/draft`

角色：Labeler。

请求 schema：`DraftSaveRequest`。

```json
{
  "answer_payload": {
    "sentiment": "positive",
    "rationale": {
      "format": "markdown",
      "content": "**Clear** positive sentiment."
    }
  }
}
```

响应 schema：`SubmissionRead`。

### POST `/labeler/assignments/{assignment_id}/submit`

角色：Labeler。

请求 schema：`SubmitRequest`，结构与草稿保存一致。

提交时后端按冻结模板校验：

- 必填字段。
- 字段类型。
- option 合法性。
- 富文本安全规则。
- 上传数量、大小、类型。
- 上传 asset 是否属于当前 assignment/submission。

校验失败通常返回 `INVALID_SUBMISSION_PAYLOAD`。

响应 schema：`SubmissionRead`。提交后会尝试触发 AI 审核工作流。

### GET `/labeler/submissions`

角色：Labeler。

返回当前 labeler 的提交列表，响应 schema：`SubmissionRead[]`。

### POST `/labeler/assignments/{assignment_id}/uploads`

角色：Labeler。

请求类型：`multipart/form-data`。

表单字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `field_id` | string | 模板中的上传字段 ID |
| `file` | file | 上传文件 |

响应 schema：`UploadAssetRead`，状态码 `201`。

```json
{
  "id": "asset-id",
  "task_id": "task-id",
  "assignment_id": "assignment-id",
  "submission_id": "submission-id",
  "uploader_id": "labeler-id",
  "field_id": "screenshots",
  "filename": "shot.png",
  "content_type": "image/png",
  "size_bytes": 12345,
  "download_url": "/uploads/asset-id/download",
  "created_at": "2026-06-10T00:00:00Z"
}
```

上传仅允许在 submission 为 draft 或 returned 时进行。API 响应不会暴露本地存储路径或服务端文件名。

## 7. Review APIs

### GET `/review/metrics`

角色：Reviewer。

响应 schema：`ReviewerMetricsRead`。用于审核员工作台指标，包括待审、SLA 上下文和个人处理统计。

### GET `/review/queue`

角色：Reviewer。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `task_id` | string | 按任务筛选 |
| `status` | `SubmissionStatus` | 按提交状态筛选 |
| `ai_decision` | `AIReviewDecision` | 按最新 AI 决策筛选 |
| `min_score` | integer 0-100 | 最新 AI 总分下限 |
| `max_score` | integer 0-100 | 最新 AI 总分上限 |
| `review_stage` | `ReviewStage` | 当前审核阶段 |

不传 `status` 时，默认返回：

- `ai_passed`
- `needs_human_review`
- `human_reviewing`

响应 schema：`ReviewQueueItemRead[]`。

### GET `/review/submissions/{submission_id}`

角色：Reviewer。

响应 schema：`ReviewSubmissionDetail`，包含：

- `submission`
- `task`
- `item`
- `template_schema`
- `agent_workflow`
- `current_stage`
- `ai_reviews`
- `human_reviews`
- `stage_history`
- `round_diffs`
- `audit_logs`
- `previous_attempts`

`round_diffs` 基于持久化 `submission_attempts` 快照生成，按相邻尝试逐字段比较。

### POST `/review/submissions/{submission_id}/approve`

角色：Reviewer。

请求 schema：`ReviewActionRequest | null`。

```json
{
  "stage": "final_review"
}
```

`stage` 可省略。响应 schema：`SubmissionRead`。

### POST `/review/submissions/{submission_id}/return`

角色：Reviewer。

请求 schema：`ReviewActionRequest`。

```json
{
  "stage": "initial_review",
  "reason": "Evidence is missing."
}
```

`reason` 必填，否则返回 `REASON_REQUIRED`。响应 schema：`SubmissionRead`。

### POST `/review/submissions/batch`

角色：Reviewer。

请求 schema：`BatchReviewRequest`。

```json
{
  "submission_ids": ["submission-1", "submission-2"],
  "action": "approve",
  "stage": "final_review"
}
```

批量退回示例：

```json
{
  "submission_ids": ["submission-1", "submission-2"],
  "action": "return",
  "stage": "initial_review",
  "reason": "Please revise the rationale."
}
```

当 `action` 为 `return` 时，`reason` 必填。响应 schema：`SubmissionRead[]`。

### GET `/review/submissions/{submission_id}/audit-export`

角色：Owner / Reviewer。

导出单个提交的审核审计记录，响应 schema：`ReviewAuditExportRead`。

响应头包含：

```http
Content-Disposition: attachment; filename="review-audit-submission-{submission_id}.json"
```

### GET `/review/tasks/{task_id}/audit-export`

角色：Owner / Reviewer。

导出任务维度的审核审计记录，响应 schema：`ReviewAuditExportRead`。

响应头包含：

```http
Content-Disposition: attachment; filename="review-audit-task-{task_id}.json"
```

## 8. AI Operations APIs

AI Operations 是给负责人和审核员查看、诊断、重试 AI 审核运行的接口组。

### GET `/ai-operations/runs`

角色：Owner / Reviewer。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `run_status` | `AIOperationRunStatus` | AI 运行状态筛选 |
| `task_id` | string | 任务筛选 |
| `ai_decision` | `AIReviewDecision` | 最新 AI 决策筛选 |

响应 schema：`AIOperationRunListItemRead[]`。

Owner 只能看到自己创建任务下的提交；Reviewer 可查看已提交运行。

### GET `/ai-operations/runs/{submission_id}`

角色：Owner / Reviewer。

响应 schema：`AIOperationRunDetailRead`，包含：

- list item 中的运行摘要字段。
- `submission`
- `task`
- `item`
- `template_schema`
- `review_config`
- `agent_workflow`
- `latest_ai_review`
- `ai_reviews`
- `audit_logs`
- `processing_logs`
- `item_payload`
- `answer_payload`
- `score_dimensions`
- `verdict`

### POST `/ai-operations/runs/{submission_id}/retry`

角色：Owner / Reviewer。

仅失败的 AI review run 可重试。响应 schema：`AIOperationRetryResponse`。

响应示意，`detail` 实际为完整 `AIOperationRunDetailRead`：

```json
{
  "retry_performed": true,
  "detail": {
    "submission_id": "submission-id",
    "run_status": "passed"
  }
}
```

当没有可重试的失败 AI review 时返回 `409`，错误码 `FAILED_AI_REVIEW_NOT_FOUND`。

## 9. Exports

### POST `/tasks/{task_id}/exports`

角色：Owner。

请求 schema：`ExportCreate`。

```json
{
  "format": "jsonl",
  "field_mapping": {
    "sentiment": "label",
    "rationale": "reason"
  },
  "include_review_metadata": true
}
```

响应 schema：`ExportJobRead`，状态码 `202`。

说明：

- Worker 会异步生成导出文件。
- 如果 Celery 入队失败，导出任务会保留为 pending，供 worker 或辅助脚本后续处理。
- 导出只包含 `approved` 或 `exportable` 提交。

### GET `/tasks/{task_id}/exports`

角色：Owner / Reviewer。

响应 schema：`ExportJobRead[]`。

### GET `/exports/{export_job_id}/download`

角色：Owner / Reviewer。

下载成功导出的文件。

常见错误：

| 错误码 | 状态码 | 说明 |
|---|---|---|
| `EXPORT_NOT_FOUND` | `404` | 导出任务不存在 |
| `PERMISSION_DENIED` | `403` | 当前用户无权下载 |
| `EXPORT_NOT_READY` | `409` | 导出任务未成功或文件路径为空 |
| `EXPORT_FILE_MISSING` | `404` | 数据库记录存在，但存储文件缺失 |

## 10. Upload Download

### GET `/uploads/{asset_id}/download`

角色：Owner / Labeler / Reviewer。

下载上传文件。后端会校验当前用户与 asset 所属 assignment、submission、task 的权限。

允许下载者：

- 上传该文件的 labeler。
- 任务 owner。
- reviewer。

无关 labeler 会被拒绝，错误码 `PERMISSION_DENIED`。

## 11. Audit Logs

### GET `/audit`

角色：Owner / Reviewer。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `entity_type` | string | 审计实体类型，例如 `submission` |
| `entity_id` | string | 审计实体 ID |

响应 schema：`AuditLogRead[]`，按 `created_at desc` 排序。

示例：

```bash
curl -s "http://localhost:8000/audit?entity_type=submission&entity_id=submission-id" \
  -H "Authorization: Bearer $TOKEN"
```

## 12. 状态和枚举

### UserRole

```text
owner
labeler
reviewer
ai_agent
```

### TaskStatus

```text
draft
published
paused
ended
```

任务状态流转：

```text
draft -> published
published -> paused
paused -> published
published -> ended
paused -> ended
```

### SubmissionStatus

```text
draft
submitted
ai_reviewing
ai_passed
ai_returned
needs_human_review
human_reviewing
approved
returned
exportable
```

### AIReviewDecision

```text
pass
return
human_review
```

### AIOperationRunStatus

```text
pending
running
passed
returned
human_review
failed
```

### ReviewStage

```text
initial_review
re_review
final_review
```

### ExportFormat

```text
json
jsonl
csv
xlsx
```

## 13. 关键 schema 名称索引

本文不重复粘贴完整 OpenAPI schema。联调时可在 `frontend/src/api/openapi.json` 或运行时 `/openapi.json` 中查看以下 schema：

- Auth：`LoginRequest`、`LoginResponse`、`UserSummary`
- Task：`TaskCreate`、`TaskUpdate`、`TaskRead`、`TaskMetricRead`、`TaskListMetricsRead`
- Import：`ItemImportPreviewRequest`、`ItemImportPreviewResponse`、`ItemImportRequest`、`TaskItemRead`
- Template：`TemplateDocument`、`TemplateDraftRequest`、`TemplateSchemaRead`
- Labeler：`ClaimRead`、`AssignmentDetailRead`、`AssignmentNavigationRead`、`AssignmentNavigationMoveRead`、`ProblemReportRequest`、`ProblemReportRead`
- Submission：`DraftSaveRequest`、`SubmitRequest`、`SubmissionRead`
- LLM Assist：`LLMFieldAssistRequest`、`LLMFieldAssistResponse`
- Review：`ReviewQueueItemRead`、`ReviewSubmissionDetail`、`ReviewActionRequest`、`BatchReviewRequest`、`ReviewAuditExportRead`
- AI Operations：`AIOperationRunListItemRead`、`AIOperationRunDetailRead`、`AIOperationRetryResponse`
- Export：`ExportCreate`、`ExportJobRead`
- Upload：`UploadAssetRead`
- Audit：`AuditLogRead`

## 14. 使用注意事项

- FastAPI live `/openapi.json` 是最终运行时契约；提交前如变更后端 schema，应同步更新前端 OpenAPI 快照和本文。
- 模板发布后不可变，提交记录必须引用当时的 `template_schema_id` 和 `schema_version`。
- Dataset import preview 可以返回混合成功/失败行，但 commit 是 all-or-nothing。
- Backend submission validation 是权威校验，不能信任前端表单预校验。
- AI review 和 LLM field assist 的 provider key 只允许服务端配置，不能出现在模板 JSON、前端代码或 API 请求中。
- `LABELHUB_LLM_API_KEY` 缺失时，AI review 走受控 fallback，field assist 返回受控 provider unavailable 错误，不会真实调用模型。
- 上传和导出当前使用本地文件系统存储；生产化前需要对象存储、备份、扫描、保留、删除和权限策略。
- `docker compose config` 会展开 `.env`。记录安全校验日志时使用 `env LABELHUB_LLM_API_KEY= docker compose config --quiet`。
