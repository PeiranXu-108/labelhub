# LabelHub

LabelHub 是一个用于 LLM 和 Agent 训练数据生产的数据标注全栈 MVP。

当前已经实现的端到端流程：

```text
负责人创建任务、导入数据项、发布标注模板
-> 标注员认领数据项并提交答案
-> AI 审核记录结构化审核结果
-> 审核员批准或退回提交
-> 负责人导出已批准的数据
```

## 技术栈

- 后端：Python 3.12、FastAPI、SQLAlchemy 2、Alembic、PostgreSQL、Redis、Celery。
- Agent：LangGraph，以及基于 LangChain 的结构化输出模型适配器。
- 前端：React 18、TypeScript、Vite、Ant Design。
- 测试：pytest、Vitest、Playwright。

## 本地后端

```bash
cd backend
python -m venv .venv313
source .venv313/bin/activate
pip install ".[test]"
alembic upgrade head
python scripts/seed_e2e_data.py demo-users
uvicorn app.main:app --reload
```

健康检查：

```bash
curl http://localhost:8000/health
```

FastAPI 在 `http://localhost:8000/openapi.json` 提供 OpenAPI 文档。

## 本地前端

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

打开 `http://localhost:5173`。

MVP 认证使用持久化 demo 用户和 JWT bearer token。先通过 `backend/scripts/seed_e2e_data.py demo-users` 写入 demo 用户，然后在 `/login` 登录：

- 负责人：`owner@example.com` / `LabelHubOwner123!`
- 标注员：`labeler@example.com` / `LabelHubLabeler123!`
- 审核员：`reviewer@example.com` / `LabelHubReviewer123!`

业务路由仍然由后端校验角色权限。旧的 `backend/scripts/seed_e2e_data.py tokens` 辅助命令仍可用于 API/E2E 辅助流程；它会先写入匹配的持久化用户，再打印 token。

## 验证

```bash
cd backend && ./.venv313/bin/pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh
```

E2E 冒烟测试需要后端和前端连接同一个数据库后再运行。下面的本地 SQLite 路径适合确定性演示和 Playwright 冒烟测试：

```bash
cd backend
env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
./.venv313/bin/alembic upgrade head

env LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
./.venv313/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

在另一个终端：

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

在第三个终端：

```bash
cd frontend
LABELHUB_DATABASE_URL=sqlite+pysqlite:////private/tmp/labelhub_e2e.sqlite \
LABELHUB_EXPORT_STORAGE_PATH=/private/tmp/labelhub_e2e_exports \
BACKEND_URL=http://127.0.0.1:8000 \
FRONTEND_URL=http://127.0.0.1:5173 \
npm run e2e
```

Playwright 冒烟测试会通过 `/login` 登录前端，并检查各角色路由。Task20 已修复本地 SQLite smoke 路径：`npm run e2e` 现在使用当前中文登录 UI 的可访问 label，并可在 Redis 不可用时创建 `pending` 导出任务，再由 `backend/scripts/seed_e2e_data.py run-export <export_job_id>` 同步生成文件。Docker-mode E2E 仍是单独限制，不能用本地 smoke 结果替代。

## 实时 AI 审核 Agent

LabelHub 默认通过 DeepSeek 的 OpenAI 兼容 API 执行实时 AI 审核。启动 API 和 worker 前，把 key 写入未提交的 `.env` 或运行环境 secret：

```bash
LABELHUB_LLM_PROVIDER=deepseek
LABELHUB_LLM_MODEL=deepseek-chat
LABELHUB_LLM_BASE_URL=https://api.deepseek.com
LABELHUB_LLM_API_KEY=
LABELHUB_LLM_TEMPERATURE=0
```

标注员提交任务后，API 会入队 `ai_review.run_ai_review`；Celery worker 调用 DeepSeek，并写入持久化 AI 审核、状态流转、prompt 快照、结构化响应和审计事件。负责人、标注员、审核员界面会展示 Agent 工作流，但不会暴露模型供应商或 API key 控件。

如果 `LABELHUB_LLM_API_KEY` 为空，后端不会发起实时模型调用。AI review 会走受控缺失凭证 fallback 并进入人工审核路径；field-level assist 会返回受控 `LLM_PROVIDER_UNAVAILABLE` 错误。

## Docker Compose

Task19 已在 Docker Desktop 29.5.2 / Docker Compose v5.1.3 上验证 `docker compose up --build` 可启动 API、frontend、worker、Postgres 和 Redis。API 会等待 Postgres/Redis healthcheck，worker/frontend 会等待 API healthcheck。

`docker compose config` 会展开本地 `.env`，可能把 secret 打到终端或日志里。只做安全校验时使用：

```bash
env LABELHUB_LLM_API_KEY= docker compose config --quiet
```

启动本地 Docker demo：

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
```

服务：

- API：`http://localhost:8000`
- 前端：`http://localhost:5173`
- Worker：用于 AI 审核/导出任务的 Celery worker
- Postgres：`localhost:5432`
- Redis：`localhost:6379`

API 容器会先运行 `alembic upgrade head`，再启动 Uvicorn。前端会接收 `VITE_API_BASE_URL=http://localhost:8000`。Compose 使用 named volumes `export-storage` 和 `upload-storage`，让 API 和 worker 共享默认 `storage/exports` / `storage/uploads` 路径；生产环境仍应替换为明确备份和保留策略的持久存储或对象存储。

可选预检：

```bash
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh
env LABELHUB_LLM_API_KEY= scripts/production_preflight.sh --runtime
```

使用 `/login` 前，先在运行中的 API 容器里写入 demo 用户：

```bash
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

## 文档

- API：`docs/api.md`
- 架构：`docs/architecture.md`
- Demo 脚本：`docs/demo-script.md`
- 部署：`docs/deployment.md`
- 已知限制：`docs/known-limitations.md`
- 协作与任务状态：`docs/agent-coordination.md`、`docs/status-board.md`
