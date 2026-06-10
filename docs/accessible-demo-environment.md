# LabelHub 可访问演示环境说明

## 演示环境地址

- 前端访问地址：https://labelhub-demo-frontend.onrender.com/login
- 后端健康检查：https://labelhub-demo-api.onrender.com/health
- 后端 API 基地址：https://labelhub-demo-api.onrender.com
- API OpenAPI JSON：https://labelhub-demo-api.onrender.com/openapi.json

健康检查预期返回：

```json
{"status":"ok"}
```

## 登录账号

演示环境已初始化以下 demo 用户：

| 角色 | 邮箱 | 密码 | 入口说明 |
| --- | --- | --- | --- |
| 负责人 | `owner@example.com` | `LabelHubOwner123!` | 创建任务、导入数据、维护模板、发布任务、查看导出 |
| 标注员 | `labeler@example.com` | `LabelHubLabeler123!` | 认领任务、填写结构化标注、提交答案 |
| 审核员 | `reviewer@example.com` | `LabelHubReviewer123!` | 查看审核队列、复核提交、批准或退回 |

## 推荐演示路径

1. 打开前端访问地址并使用负责人账号登录。
2. 进入负责人任务页，创建任务、导入一条演示数据、配置并发布标注模板。
3. 退出后使用标注员账号登录，认领任务并提交标注结果。
4. 退出后使用审核员账号登录，进入审核队列查看提交内容并执行审核。
5. 重新使用负责人账号登录，查看任务状态和导出入口。

完整讲解脚本可参考 README 中的演示流程说明。

## 部署平台与资源

该演示环境部署在 Render，当前资源如下：

- `labelhub-demo-frontend`：React/Vite 静态站点。
- `labelhub-demo-api`：FastAPI Docker Web Service。
- `labelhub-demo-db`：Render PostgreSQL。
- `labelhub-demo-redis`：Render Key Value/Valkey。

后端启动时会执行数据库迁移，并通过 `LABELHUB_SEED_DEMO_USERS=true` 自动写入 demo 用户。

## 当前验证状态

验证时间：2026-06-10。

- `GET https://labelhub-demo-api.onrender.com/health` 返回 `200 OK`。
- `POST https://labelhub-demo-api.onrender.com/auth/login` 使用负责人账号返回 `200 OK` 和 bearer token。
- 前端登录页可通过公网地址访问。

## 已知限制

- 当前 Render 免费实例不支持常驻 background worker、Shell 和 One-Off Jobs。
- 因此 Celery 后台任务不会自动消费；AI review 和导出后台处理在免费演示环境中仅作为功能入口展示。
- 上传和导出文件仍使用容器本地路径，不能作为生产持久存储。
- 免费实例可能因空闲休眠，首次访问可能需要等待几十秒。
- 该环境仅用于课程/答辩演示，请勿上传敏感数据或生产数据。
