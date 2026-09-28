# 字节跳动AI全栈挑战赛 LabelHub / ByteDance AI Full-Stack Challenge LabelHub

LabelHub 是一个面向 LLM / Agent 训练数据生产的数据标注全栈项目，覆盖任务创建、数据导入、模板配置、标注提交、AI 分流、人工审核与结果导出等核心链路。

LabelHub is a full-stack data annotation project for LLM and agent training data production. It covers task creation, data import, template configuration, annotation submission, AI triage, human review, and result export.

## 在线演示 / Live Demo

- 前端演示地址 / Frontend demo: https://labelhub-demo-frontend.onrender.com/login
- 后端健康检查 / Backend health check: https://labelhub-demo-api.onrender.com/health
- OpenAPI JSON: https://labelhub-demo-api.onrender.com/openapi.json
- 演示视频 / Demo video: https://drive.google.com/file/d/1d7LaMn1eT8YkWP1JiJnlUSMF9u1IeG6e/view?usp=drive_link

Render 免费实例空闲后可能休眠，首次打开页面可能需要等待几十秒。

Render free instances may sleep when idle, so the first page load may take several dozen seconds.

## Demo 账号 / Demo Accounts

| 角色 / Role | 邮箱 / Email | 密码 / Password |
| --- | --- | --- |
| 负责人 / Owner | `owner@example.com` | `LabelHubOwner123!` |
| 标注员 / Labeler | `labeler@example.com` | `LabelHubLabeler123!` |
| 审核员 / Reviewer | `reviewer@example.com` | `LabelHubReviewer123!` |

## 功能链路 / Workflow

```text
负责人创建任务、导入数据项、发布标注模板 / Owner creates a task, imports items, and publishes an annotation template
-> 标注员认领数据项并提交结构化答案 / Labeler claims an item and submits structured answers
-> AI 审核记录结构化审核结果 / AI review records structured review results
-> 审核员批准或退回提交 / Reviewer approves or returns the submission
-> 负责人导出已批准的数据 / Owner exports approved data
```

## 技术栈 / Stack

- 前端 / Frontend: React 18、TypeScript、Vite、Ant Design。
- 后端 / Backend: Python 3.12、FastAPI、SQLAlchemy 2、Alembic。
- 数据与任务 / Data and tasks: PostgreSQL、Redis / Valkey、Celery。
- AI / Agent: LangGraph、LangChain OpenAI-compatible provider。
- 测试 / Tests: pytest、Vitest、Playwright。
- 部署 / Deployment: Render Blueprint、Docker。

## 本地启动 / Local Setup

后端 / Backend:

```bash
cd backend
python -m venv .venv313
source .venv313/bin/activate
pip install ".[test]"
alembic upgrade head
python scripts/seed_e2e_data.py demo-users
uvicorn app.main:app --reload
```

前端 / Frontend:

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

打开 `http://localhost:5173/login`。 / Open `http://localhost:5173/login`.

## Docker 启动 / Docker Setup

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

服务地址 / Service URLs:

- 前端 / Frontend: `http://localhost:5173`
- API: `http://localhost:8000`
- 健康检查 / Health check: `http://localhost:8000/health`

## 验证命令 / Verification

```bash
cd backend && ./.venv313/bin/python -m pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
```

## 提交材料 / Submission Materials

- 源码仓库 / Source repository: https://github.com/PeiranXu-108/labelhub
- 可访问演示环境 / Accessible demo environment: `docs/accessible-demo-environment.md`
- Render 部署说明 / Render deployment guide: `docs/ai-dev-docs/render-demo-deployment.md`
- API 文档 / API documentation: `frontend/src/api/openapi.json`
- 演示视频 / Demo video: https://drive.google.com/file/d/1d7LaMn1eT8YkWP1JiJnlUSMF9u1IeG6e/view?usp=drive_link

## 已知限制 / Known Limitations

- Render 免费实例不支持常驻 background worker、Shell 和 One-Off Jobs。
  Render free instances do not support persistent background workers, Shell, or One-Off Jobs.
- 免费演示环境中 AI review 和 export 后台任务主要作为功能入口展示。
  In the free demo environment, AI review and export background tasks are primarily shown as feature entry points.
- 上传和导出文件仍使用容器本地路径，不作为生产持久存储。
  Uploaded and exported files still use container-local paths and are not stored in production-grade persistent storage.
- 演示环境仅用于课程/答辩，请勿上传敏感数据。
  The demo environment is for coursework and presentations only; do not upload sensitive data.
