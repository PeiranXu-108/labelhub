# 字节跳动AI全栈挑战赛 labelhub

LabelHub 是一个面向 LLM / Agent 训练数据生产的数据标注全栈项目，覆盖任务创建、数据导入、模板配置、标注提交、AI 分流、人工审核与结果导出等核心链路。

## 在线演示

- 前端演示地址：https://labelhub-demo-frontend.onrender.com/login
- 后端健康检查：https://labelhub-demo-api.onrender.com/health
- OpenAPI JSON：https://labelhub-demo-api.onrender.com/openapi.json
- 演示视频：https://drive.google.com/file/d/1d7LaMn1eT8YkWP1JiJnlUSMF9u1IeG6e/view?usp=drive_link

Render 免费实例空闲后可能休眠，首次打开页面可能需要等待几十秒。

## Demo 账号

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 负责人 | `owner@example.com` | `LabelHubOwner123!` |
| 标注员 | `labeler@example.com` | `LabelHubLabeler123!` |
| 审核员 | `reviewer@example.com` | `LabelHubReviewer123!` |

## 功能链路

```text
负责人创建任务、导入数据项、发布标注模板
-> 标注员认领数据项并提交结构化答案
-> AI 审核记录结构化审核结果
-> 审核员批准或退回提交
-> 负责人导出已批准的数据
```

## 技术栈

- 前端：React 18、TypeScript、Vite、Ant Design。
- 后端：Python 3.12、FastAPI、SQLAlchemy 2、Alembic。
- 数据与任务：PostgreSQL、Redis / Valkey、Celery。
- AI / Agent：LangGraph、LangChain OpenAI-compatible provider。
- 测试：pytest、Vitest、Playwright。
- 部署：Render Blueprint、Docker。

## 本地启动

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

打开 `http://localhost:5173/login`。

## Docker 启动

```bash
env LABELHUB_LLM_API_KEY= docker compose up --build
docker compose exec api python scripts/seed_e2e_data.py demo-users
```

服务地址：

- 前端：`http://localhost:5173`
- API：`http://localhost:8000`
- 健康检查：`http://localhost:8000/health`

## 验证命令

```bash
cd backend && ./.venv313/bin/python -m pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
env LABELHUB_LLM_API_KEY= docker compose config --quiet
```

## 提交材料

- 源码仓库：https://github.com/PeiranXu-108/labelhub
- 可访问演示环境：`docs/accessible-demo-environment.md`
- Render 部署说明：`docs/render-demo-deployment.md`
- API 文档：`frontend/src/api/openapi.json`
- 演示视频：https://drive.google.com/file/d/1d7LaMn1eT8YkWP1JiJnlUSMF9u1IeG6e/view?usp=drive_link

## 已知限制

- Render 免费实例不支持常驻 background worker、Shell 和 One-Off Jobs。
- 免费演示环境中 AI review 和 export 后台任务主要作为功能入口展示。
- 上传和导出文件仍使用容器本地路径，不作为生产持久存储。
- 演示环境仅用于课程/答辩，请勿上传敏感数据。
