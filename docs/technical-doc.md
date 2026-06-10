# LabelHub 基础技术文档

本文面向项目评审、交付验收和后续维护交接。它提供一份从业务目标到技术实现的基础说明，帮助读者快速判断 LabelHub 当前能做什么、如何运行、关键模块在哪里，以及哪些事项仍属于 MVP 限制。

更细的接口、部署和限制说明以现有专题文档为准：

- API 契约：`docs/api.md`
- 架构图与模块边界：`docs/architecture.md`
- 部署与预检：`docs/deployment.md`
- 已知限制：`docs/known-limitations.md`
- 任务状态与协作记录：`docs/status-board.md`

## 1. 项目定位

LabelHub 是一个用于 LLM 和 Agent 训练数据生产的数据标注全栈 MVP。当前目标是覆盖一条可演示、可审计的内部数据生产链路，而不是提供通用众包平台或完整生产级账号、支付、合规和数据治理系统。

当前端到端流程为：

```text
负责人创建任务、导入数据项、发布标注模板
-> 标注员认领数据项并提交答案
-> AI 审核 Agent 生成结构化预审记录
-> 审核员批准或退回提交
-> 负责人导出已批准数据
```

系统核心设计原则：

- 工作流状态必须由后端统一控制，不能只依赖前端页面状态。
- 模板 schema 发布后不可变，提交记录必须引用当时使用的模板版本。
- AI 审核是可审计的系统参与者，结果以结构化记录持久化。
- 导出只面向已批准、可交付的数据。
- MVP 允许本地文件存储和 demo 账号，但生产化前必须补齐身份、存储、数据保留和安全策略。

## 2. 技术栈总览

后端：

- Python 3.12
- FastAPI
- Pydantic v2 / pydantic-settings
- SQLAlchemy 2
- Alembic
- PostgreSQL
- Redis
- Celery
- PyJWT / passlib

AI Agent：

- LangGraph
- LangChain OpenAI-compatible provider adapter
- 默认 DeepSeek OpenAI-compatible API
- 缺失凭证时使用受控 fallback，不发起真实模型调用

前端：

- React 18
- TypeScript
- Vite
- Ant Design 5
- `@ant-design/x`
- React Router
- Zustand

测试与验证：

- 后端：pytest
- 前端：Vitest
- E2E：Playwright
- 部署预检：`scripts/production_preflight.sh`
- 容器编排：Docker Compose

## 3. 运行时架构

```mermaid
flowchart LR
  Owner["Owner UI"] --> API["FastAPI API"]
  Labeler["Labeler UI"] --> API
  Reviewer["Reviewer UI"] --> API
  API --> DB["PostgreSQL"]
  API --> Redis["Redis broker"]
  Worker["Celery worker"] --> Redis
  Worker --> DB
  Worker --> Agent["LangGraph AI review"]
  API --> Storage["Local upload/export storage"]
  Worker --> Storage
```

运行时由五类服务组成：

- `frontend`：Vite React 应用，提供负责人、标注员、审核员工作台。
- `api`：FastAPI 服务，负责认证、权限、业务 API、状态流转、文件下载。
- `worker`：Celery worker，处理 AI 审核和导出任务。
- `postgres`：默认业务数据库。
- `redis`：Celery broker。

Docker Compose 中 API 会先执行 `alembic upgrade head`，再启动 Uvicorn。Worker 与 API 共享上传和导出本地卷，确保 worker 生成的导出文件可以由 API 下载。

## 4. 代码结构

项目采用简单前后端分离结构：

```text
backend/
  app/
    api/          FastAPI 依赖和路由
    agent/        LangGraph 审核图、prompt、provider 配置和结构化 schema
    core/         全局配置与安全工具
    db/           SQLAlchemy session/base
    domain/       枚举和领域常量
    models/       SQLAlchemy ORM 模型
    schemas/      Pydantic API 契约
    services/     核心业务服务
    storage/      本地文件存储适配
    workers/      Celery app 与异步任务入口
  alembic/        数据库迁移
  scripts/        OpenAPI 导出、demo 数据、E2E 辅助脚本
  tests/          后端测试

frontend/
  src/
    features/     按业务域拆分的 UI 和 API 封装
    routes/       页面路由组件
    App.tsx       全局路由、鉴权和应用壳
    main.tsx      React 入口
  e2e/            Playwright 测试
```

关键入口：

- 后端应用入口：`backend/app/main.py`
- 后端配置：`backend/app/core/config.py`
- LLM provider 配置：`backend/app/agent/config.py`
- Celery app：`backend/app/workers/celery_app.py`
- 前端应用入口：`frontend/src/main.tsx`
- 前端路由与角色保护：`frontend/src/App.tsx`

## 5. 后端模块边界

HTTP 路由层位于 `backend/app/api/routes`，负责请求契约、鉴权依赖和角色权限检查。业务逻辑主要下沉到 `backend/app/services`：

- `tasks.py`：任务创建、更新、发布、暂停、结束和任务读取。
- `dataset_import.py`：JSON array、JSONL、XLSX 数据导入预览与提交校验。
- `templates.py`：模板草稿、发布、版本化和 schema 校验。
- `submissions.py`：认领、草稿保存、提交、尝试历史和标注员相关行为。
- `workflow.py`：任务和提交状态流转的中心入口。
- `ai_review.py`：AI 审核编排、结构化响应校验、持久化和状态流转。
- `review_operations.py` / `review_stages.py`：人工审核、退回、复审和多阶段审核逻辑。
- `exports.py`：导出任务创建、记录加载和 JSON/JSONL/CSV/XLSX writer。
- `uploads.py`：上传文件的校验、存储、元数据和下载权限。
- `llm_field_assist.py`：模板内 `llm_trigger` 字段的服务端辅助生成。

后端必须作为权限和业务状态的最终裁决方。前端路由保护只提升体验，不能替代 API 层和服务层校验。

## 6. 前端模块边界

前端围绕角色和业务能力拆分：

- `features/auth`：登录、token 存取、当前用户和默认角色路由。
- `features/owner`：负责人任务运营视图。
- `features/labeler`：标注员任务市场、认领、作答和提交工作台。
- `features/reviewer`：审核队列、审核详情、批准和退回操作。
- `features/template`：模板 schema 展示与编辑相关能力。
- `features/schema-renderer`：动态表单渲染。
- `features/export`：导出任务和下载。
- `features/agent-workflow` 与 `routes/ai-operations`：AI 审核运行态、决策和详情展示。
- `features/studio`：应用壳、首页和运营面板。

`frontend/src/App.tsx` 集中定义全局路由和 `RequireRole`。未登录用户会跳转 `/login`，角色不匹配时会跳转到该角色默认首页。

## 7. 核心业务流程

### 7.1 任务与数据导入

负责人创建任务后，可以配置说明、标签、奖励规则、质量规则和 Review config。任务数据支持 JSON array、JSONL、XLSX 导入。导入先走 preview，返回行级错误和警告；commit 阶段仍由后端做权威校验，并采用 all-or-nothing 策略。

重复 `external_id` 在同一任务内会被拒绝；`external_id: null` 的行允许重复。

### 7.2 模板发布与版本化

负责人先保存模板草稿，再发布模板。发布后的模板 schema 不可变。标注员提交答案时，提交记录会保存 `template_schema_id` 和 `schema_version`，确保后续审核与导出仍能还原当时的表单契约。

模板支持基础输入字段、选择字段、评分、JSON、富文本、图片/文件上传和 `llm_trigger` 辅助字段。具体 schema 形状以 `docs/api.md` 为准。

### 7.3 标注提交

标注员只能访问已发布任务，并通过 claim 获取可处理的数据项。后端创建 assignment 和 submission draft，标注员可保存草稿并最终提交。

提交时后端会按冻结模板快照验证答案，包括必填项、字段类型、富文本安全规则和上传文件约束。提交通过后会进入 AI 预审或人工审核路径。

### 7.4 AI 审核

标注提交后，API 会尝试入队 `ai_review.run_ai_review`。Worker 调用 LangGraph 审核流程，使用结构化输出写入 AI review 记录，并通过 `WorkflowService` 推进状态。

AI 审核记录会保留 prompt 快照、模型配置元数据、结构化响应、失败原因和审计事件。模型输出不能作为自由文本解析的唯一事实来源。

当 `LABELHUB_LLM_API_KEY` 缺失时，系统不会发起真实模型调用。AI review 会产生受控失败或 fallback 记录，并路由到人工审核；field-level assist 会返回受控 provider unavailable 路径。

### 7.5 人工审核

审核员从审核队列进入提交详情，结合原始数据、冻结模板、标注答案、AI 元数据、审计日志和历史尝试做决策。审核员可以批准或退回提交。退回会保留原因和历史尝试，标注员可继续修正。

### 7.6 导出

负责人创建导出任务后，worker 生成文件，API 提供下载。导出面向已批准、可交付记录，支持 JSON、JSONL、CSV、XLSX。Compose 下 API 和 worker 使用共享本地卷；生产部署前应替换为有备份、保留和权限策略的持久存储或对象存储。

## 8. 配置与环境

常用后端配置使用 `LABELHUB_` 前缀，由 `backend/app/core/config.py` 读取：

```text
LABELHUB_DATABASE_URL=postgresql+psycopg://labelhub:labelhub@localhost:5432/labelhub
LABELHUB_REDIS_URL=redis://localhost:6379/0
LABELHUB_JWT_SECRET_KEY=replace-with-a-local-secret
LABELHUB_EXPORT_STORAGE_PATH=storage/exports
LABELHUB_UPLOAD_STORAGE_PATH=storage/uploads
```

AI provider 配置支持 `LABELHUB_LLM_*`，也兼容不带前缀的 `LLM_*`：

```text
LABELHUB_LLM_PROVIDER=deepseek
LABELHUB_LLM_MODEL=deepseek-chat
LABELHUB_LLM_BASE_URL=https://api.deepseek.com
LABELHUB_LLM_API_KEY=<secret>
LABELHUB_LLM_TEMPERATURE=0
```

前端通过 Vite 环境变量连接后端：

```text
VITE_API_BASE_URL=http://localhost:8000
```

不要提交真实 secret。需要记录 Compose 配置校验结果时，使用：

```bash
env LABELHUB_LLM_API_KEY= docker compose config --quiet
```

避免直接粘贴 `docker compose config` 输出，因为它会展开本地 `.env` 中的敏感值。

## 9. 本地运行

后端：

```bash
cd backend
python -m venv .venv313
source .venv313/bin/activate
pip install ".[test]"
alembic upgrade head
python scripts/seed_e2e_data.py demo-users
uvicorn app.main:app --reload
```

前端：

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

访问地址：

- API health：`http://localhost:8000/health`
- OpenAPI：`http://localhost:8000/openapi.json`
- 前端：`http://localhost:5173`

Demo 用户：

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 负责人 | `owner@example.com` | `LabelHubOwner123!` |
| 标注员 | `labeler@example.com` | `LabelHubLabeler123!` |
| 审核员 | `reviewer@example.com` | `LabelHubReviewer123!` |

## 10. Docker Compose 运行

本地 demo 可使用：

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
```

服务端口：

- API：`http://localhost:8000`
- 前端：`http://localhost:5173`
- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`

API 容器会自动执行迁移。登录前需要写入 demo 用户：

```bash
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

生产化前需要替换 demo JWT secret、demo 用户、Vite dev server、root worker 用户、本地存储和未定义的数据治理策略。

## 11. 验证命令

常规验证：

```bash
cd backend && ./.venv313/bin/pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh
```

E2E 冒烟测试需要后端和前端连接同一个数据库。当前支持的确定性 smoke 路径是本地 SQLite，详见 `README.md` 和 `docs/deployment.md`。Docker runtime 的完整 Playwright E2E 仍有已知限制，不能用本地 smoke 结果替代生产 worker 验证。

## 12. 交付现状与限制

当前已具备：

- 三角色 demo 登录与后端角色权限校验。
- 任务创建、数据导入、模板发布和标注提交。
- 模板版本化和提交历史。
- AI 审核 Agent 的结构化记录、审计和缺失凭证 fallback。
- 人工审核批准、退回和多阶段复核基础能力。
- 多格式导出。
- Docker Compose demo runtime。
- 后端、前端和本地 SQLite E2E smoke 验证路径。

主要限制：

- 认证仍是 MVP JWT 和 demo 用户模式，没有 SSO、OAuth、密码重置、refresh token 或生产账号生命周期。
- 上传和导出使用本地文件系统存储，没有对象存储、备份、扫描、自动清理、保留或 legal hold。
- Live AI 调用需要配置并审批 provider key、数据策略、区域、留存和脱敏方案。
- 前端 Docker 服务仍运行 Vite dev server，不是生产静态服务。
- Celery worker 容器当前以 root 运行。
- 任务奖励规则只是元数据，不执行支付或结算。
- 敏感数据处理、隐私策略和生产数据保留策略尚未定义。

更完整的限制清单见 `docs/known-limitations.md`。
