# LabelHub 提交包说明

## 项目简介

LabelHub 是一个用于 LLM 和 Agent 训练数据生产的数据标注全栈 MVP。当前交付目标是覆盖一条可演示、可审计的内部数据生产链路，而不是完整生产级众包、账号、支付、合规或数据治理系统。

当前端到端流程为：

```text
负责人创建任务、导入数据项、发布标注模板
-> 标注员认领数据项并提交答案
-> AI 审核 Agent 生成结构化预审记录
-> 审核员批准或退回提交
-> 负责人导出已批准数据
```

## 目录结构

```text
submission/
  README.md                 根目录入口说明
  technical-doc.md          中文基础技术文档
  api-doc.md                API 参考文档
  ai-dev-docs/              架构、部署、Demo、限制、任务和交接文档
  labelhub/                 LabelHub 全栈应用源码
    backend/                FastAPI、SQLAlchemy、Alembic、Celery、LangGraph
    frontend/               React、TypeScript、Vite、Ant Design
    docker-compose.yml      本地 Docker demo 编排
    render.yaml             Render demo 部署配置
  videos/                   演示录屏、探针截图和导出样例
```

根目录文档用于快速了解交付包；应用运行、开发和测试主要在 `labelhub/` 目录内完成。

## 核心能力

- 三角色 demo 登录：负责人、标注员、审核员。
- 负责人可创建任务、维护说明和标签、导入 JSON array、JSONL 或 XLSX 数据项。
- 模板支持草稿、发布、版本化和冻结快照，提交记录会引用当时使用的模板版本。
- 标注员可从任务市场认领任务、保存草稿、提交答案、使用字段级 LLM assist。
- AI 审核通过 LangGraph 生成结构化记录，并保留 prompt、模型元数据、失败原因和审计事件。
- 审核员可查看队列、AI 元数据、历史尝试、轮次差异和审计时间线，并执行批准或退回。
- 导出仅面向已批准、可交付数据，支持 JSON、JSONL、CSV、XLSX。
- Docker Compose demo runtime 可启动 API、前端、worker、PostgreSQL 和 Redis。

## 技术栈

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
- 缺失模型凭证时走受控 fallback，不发起真实模型调用

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
- 部署预检：`labelhub/scripts/production_preflight.sh`
- 容器编排：Docker Compose

## 本地运行

后端：

```bash
cd labelhub/backend
python -m venv .venv313
source .venv313/bin/activate
pip install ".[test]"
alembic upgrade head
python scripts/seed_e2e_data.py demo-users
uvicorn app.main:app --reload
```

前端：

```bash
cd labelhub/frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

默认访问地址：

- API health：`http://localhost:8000/health`
- OpenAPI：`http://localhost:8000/openapi.json`
- 前端：`http://localhost:5173`
- 登录页：`http://localhost:5173/login`

## Docker Compose

从根目录进入应用目录：

```bash
cd labelhub
```

安全校验 Compose 配置：

```bash
env LABELHUB_LLM_API_KEY= docker compose config --quiet
```

启动本地 Docker demo：

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
```

API 容器完成迁移后写入 demo 用户：

```bash
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

服务端口：

- API：`http://localhost:8000`
- 前端：`http://localhost:5173`
- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`

注意：普通 `docker compose config` 会展开本地 `.env`，可能把 secret 打到终端或日志。记录校验结果时使用上面的 `env LABELHUB_LLM_API_KEY= docker compose config --quiet`。

## Demo 账号

先执行 `python scripts/seed_e2e_data.py demo-users` 或 Docker 容器内同名命令，再使用以下账号登录：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 负责人 | `owner@example.com` | `LabelHubOwner123!` |
| 标注员 | `labeler@example.com` | `LabelHubLabeler123!` |
| 审核员 | `reviewer@example.com` | `LabelHubReviewer123!` |

## API 快速开始

本地和 Docker demo 默认 Base URL 都是：

```text
http://localhost:8000
```

FastAPI 当前没有 `/api/v1` 路由前缀，接口路径直接从根路径开始，例如 `/auth/login`、`/tasks`。除 `GET /health` 和 `POST /auth/login` 外，业务接口均使用 JWT Bearer token：

```http
Authorization: Bearer <access_token>
```

登录示例：

```bash
curl -s http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"LabelHubOwner123!"}'
```

带 token 调用任务接口：

```bash
TOKEN="<access_token>"
curl -s http://localhost:8000/tasks \
  -H "Authorization: Bearer $TOKEN"
```

更多接口、错误结构、枚举和 schema 索引见 [api-doc.md](api-doc.md)。

## AI 审核配置

LabelHub 默认通过 DeepSeek 的 OpenAI-compatible API 执行实时 AI 审核。启动 API 和 worker 前，将凭证写入未提交的 `.env`、shell 环境或部署 secret：

```text
LABELHUB_LLM_PROVIDER=deepseek
LABELHUB_LLM_MODEL=deepseek-chat
LABELHUB_LLM_BASE_URL=https://api.deepseek.com
LABELHUB_LLM_API_KEY=<secret>
LABELHUB_LLM_TEMPERATURE=0
```

标注员提交任务后，API 会入队 `ai_review.run_ai_review`；Celery worker 调用 LangGraph 审核流程，并持久化结构化 AI 审核、状态流转、prompt 快照、模型元数据和审计事件。

如果 `LABELHUB_LLM_API_KEY` 为空，后端不会发起真实模型调用。AI review 会走受控缺失凭证 fallback 并进入人工审核路径；field-level assist 会返回受控 `LLM_PROVIDER_UNAVAILABLE` 错误。

## 验证命令

常规验证：

```bash
(cd labelhub/backend && ./.venv313/bin/pytest -q)
(cd labelhub/frontend && npm test -- --run)
(cd labelhub/frontend && npm run build)
(cd labelhub && env LABELHUB_LLM_API_KEY= docker compose config --quiet)
(cd labelhub && env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh)
```

本地 SQLite E2E smoke 需要后端和前端连接同一个数据库。

后端终端：

```bash
cd labelhub/backend
env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_e2e_uploads \
./.venv313/bin/alembic upgrade head

env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_e2e_uploads \
./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端终端：

```bash
cd labelhub/frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

E2E 终端：

```bash
cd labelhub/frontend
LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
LABELHUB_UPLOAD_STORAGE_PATH=/private/tmp/labelhub_e2e_uploads \
BACKEND_URL=http://127.0.0.1:8000 \
FRONTEND_URL=http://127.0.0.1:5173 \
npm run e2e
```

截至现有状态文档记录，2026-06-09 本地 SQLite smoke 路径通过。Docker-mode 完整 Playwright E2E、live provider 验证和生产硬化仍属于单独限制。

## 文档索引

根目录文档：

- [technical-doc.md](technical-doc.md)：中文基础技术文档，覆盖项目定位、架构、模块边界、运行、验证和限制。
- [api-doc.md](api-doc.md)：API 参考，覆盖认证、接口目录、请求响应、状态枚举和 schema 索引。

AI 开发与交付文档：

- [ai-dev-docs/architecture.md](ai-dev-docs/architecture.md)：运行时架构、模块边界、数据流、持久化和 AI 审核。
- [ai-dev-docs/deployment.md](ai-dev-docs/deployment.md)：Docker Compose、环境变量、预检、本地 smoke 和生产注意事项。
- [ai-dev-docs/demo-script.md](ai-dev-docs/demo-script.md)：5 到 10 分钟演示脚本。
- [ai-dev-docs/known-limitations.md](ai-dev-docs/known-limitations.md)：已知限制、环境阻塞、生产策略缺口和测试阻塞。
- [ai-dev-docs/status-board.md](ai-dev-docs/status-board.md)：任务状态、冻结契约、开放决策、集成风险和最新验证。
- [ai-dev-docs/render-demo-deployment.md](ai-dev-docs/render-demo-deployment.md)：Render demo 部署说明。
- [ai-dev-docs/technical-solution.md](ai-dev-docs/technical-solution.md)：完整技术方案和开发约束。

应用目录文档：

- [labelhub/README.md](labelhub/README.md)：应用内 README，包含本地运行、Docker、验证和账号信息。

演示素材：

- [videos/](videos/)：录屏、帧截图、探针截图和导出样例。

## 已知限制

- 认证仍是 MVP JWT 和 demo 用户模式，没有 SSO、OAuth、密码重置、refresh token 或生产账号生命周期。
- 上传和导出使用本地文件系统或 Compose named volume，没有对象存储、备份、扫描、自动清理、保留或 legal hold。
- Live AI 调用需要先明确 provider key、数据策略、区域、留存、脱敏和审计方案。
- 缺失 `LABELHUB_LLM_API_KEY` 时，AI review 和 field-level assist 会进入受控 fallback，不代表 live provider 已验证。
- 前端 Docker 服务仍运行 Vite dev server；互联网暴露前应替换为静态生产服务或平台构建。
- Celery worker 容器当前以 root 运行，生产部署前应切换非 root 用户或镜像策略。
- 任务奖励规则只是元数据，不执行支付、结算、税务、账本或外部支付集成。
- 敏感数据处理、隐私策略、生产数据保留策略、多阶段审核 staffing/SLA 等仍需产品和合规决策。
- Docker runtime 启动已在既有环境验证，但 Docker-mode 完整 Playwright E2E、live provider 验证、对象存储、扫描、备份和生产身份策略仍是生产前阻塞项。
