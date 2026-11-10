# Taskflow AI — AI Task Manager Frontend

现代化、响应式的 AI Task Manager 工作台前端。采用 **React + TypeScript + Vite + Tailwind CSS + shadcn 风格 UI 组件**，对接原项目 **Python / FastAPI**。

> 本前端根据 `EighthhDayy/ai-task-manager` 仓库 **2026-11-09 main 分支**的实际 API 编写。没有用假的后端数据代替真实任务。

## 已实现

| 页面 | 状态 | 后端接口 |
| --- | --- | --- |
| 登录 / 注册 | ✅ 已接入 | `POST /login`, `POST /users`, `GET /me` |
| 工作台概览 | ✅ 已接入 | 汇总 `GET /my/tasks` 的真实数据 |
| 任务 CRUD | ✅ 已接入 | `GET/POST /my/tasks`, `PATCH/DELETE /my/tasks/{task_id}` |
| Qwen3 问答 | ✅ 已接入请求；依赖后端模型服务 | `POST /ai/Qwen3-qa` |
| RAG 文档知识库 | 🟡 界面已完成，等待接口 | 当前 main 无上传、文件列表和检索路由 |
| Agent 工具调用聊天 | 🟡 信息和界面位置已预留 | 当前 main 无 Agent 对话路由 |
| 无后端预览 | ✅ 演示模式 | **明确标记的示例数据**，只在内存中模拟任务交互 |

说明：`POST /ai/Qwen3-qa` 在当前仓库中经 Wikipedia 检索后调用配置的 Qwen3 模型；**它不是私有文档 RAG 问答，也不是会执行任务的 Agent**。前端明确区分这几类能力。

## 本地开发

要求：**Node.js 20.19+ 或 22.12+**（建议 22 LTS）；Python/FastAPI 后端按原项目 README 另行运行。

推荐把本目录复制到原仓库根目录，命名为 `frontend/`，最终目录如下：

```text
ai-task-manager/
├── main.py
├── src/
├── pyproject.toml
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
```

打开两个终端：

**终端 A — 启动后端**（示例；具体数据库和环境变量参考原项目）：

```bash
# 在 ai-task-manager 仓库根目录
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**终端 B — 启动前端**：

```bash
cd frontend
npm install
npm run dev
```

访问 **http://localhost:5173**。

默认开发代理：浏览器请求 `/api/my/tasks` → Vite → `http://127.0.0.1:8000/my/tasks`。无需修改 FastAPI CORS 配置；也不会直接向浏览器暴露 JWT 给其他源。其他后端地址可用 `FASTAPI_PROXY_TARGET` 配置。

没有启动后端也可以在登录页选择 **先体验演示工作台**。演示模式的数据带有明显标识，刷新后不会保留。

## 构建

```bash
npm run typecheck
npm run build
npm run preview
```

产物在 `dist/` 下。独立部署时，将 `/api/` 反向代理到 FastAPI，或者在构建前设置 `VITE_API_BASE_URL=https://your-fastapi-domain`。后者跨域时，FastAPI 必须配置允许前端域名的 CORS。

注意：`VITE_*` 是编译进客户端的变量，**不要**放入 API Key、数据库密码、JWT 签名密钥等服务端秘密。

## 后端要求

原项目必须正确设置数据库连接、`SECRET_KEY` 和用户表，确保 `/login` `/me` `/my/tasks` 工作。Qwen3 问答还需要后端 `TRANSFORMER_QA_URL` 指向可用的 `/predict` 模型服务；模型无配置时，前端会真实显示 503 错误。

当前注册、登录都使用 FastAPI 现有的 JSON request body，而不是 OAuth form data。

前端 token 保存在 `sessionStorage`（仅当前浏览器会话）；刷新页面仍可恢复当前会话。正式公开部署建议进一步落实 HTTPS、请求限流、错误监控，以及适合生产环境的鉴权方案。

## 与后端继续集成

在你把 Agent 和文档功能合并进 `main` 并明确 API schema 后，建议继续实现：

- Agent：消息提交、模型流式返回（SSE）、工具调用事件与人工确认 UI。
- 知识库：PDF 上传、RQ job 轮询、文档索引状态、检索来源展示。
- 任务：若后端增加 `priority`、`due_date` 等字段，再追加对应 UI，不应在当前版本假装已有这些能力。

## 设计说明

shadcn 风格的可复用 Button 组件与原生 CSS + Tailwind v4 提供响应式布局；UI 采用简洁的 SaaS 工作台风格，包括渐变 Hero、统计卡片、进度环、列表交互、聊天对话、移动端侧边栏和模态框。图标使用 lucide-react，界面不依赖第三方图片服务。

## 重要说明

这是完整可运行的前端源码包，**不是仅供展示的图片**。由于生成环境无法从 npm registry 安装依赖，本交付已经过 TypeScript / TSX 语法解析检查，但尚未完成 `npm install`、`npm run build` 和联调实测。你本地安装依赖后请先运行上述检查命令。
