# MCP 任务工具

本模块使用官方 MCP Python SDK 2.x，通过 **stdio** 对外提供任务工具。
MCP 客户端发现工具后，可以调用已有 FastAPI 接口；数据仍由原有数据库保存，
JWT 鉴权和任务归属检查仍由 `/my/tasks` 接口执行。

| 工具 | 参数 | 对应接口 |
| --- | --- | --- |
| `list_tasks` | 无 | `GET /my/tasks` |
| `create_task` | `title`，可选 `description` | `POST /my/tasks` |
| `complete_task` | 正整数 `task_id` | `PATCH /my/tasks/{task_id}` |

每个本地 MCP 进程使用一个用户的 JWT。模型不能通过参数指定其他用户或更换 token。
工具有类型化输入、结构化输出和读写标记；空标题、非法 ID 等会在请求 API 前被校验。
创建任务超时不会自动重试，因为请求可能已经成功，应先查询任务再决定是否重试。

## 1. 安装并启动原有 API

在项目根目录执行（Python 3.13+，沿用项目要求）：

```bash
uv sync --frozen --extra mcp
uv run uvicorn main:app --reload
```

数据库和 `.env` 按原项目的方式配置。MCP 模块不需要额外数据库表，也不需要模型 API key。

## 2. 配置用户凭证

在 Swagger `/docs` 中，用已有账号调用 `POST /login`，复制返回的 `access_token`。
如果没有账号，先调用 `POST /users` 注册。把以下两行加入根目录 `.env`：

```dotenv
AI_TASK_MANAGER_API_URL=http://127.0.0.1:8000
AI_TASK_MANAGER_TOKEN=替换为登录返回的access_token
```

这里只填 token 本身，不加 `Bearer `。`.env` 已被 Git 忽略。
JWT 过期后重新登录，更新配置并重启 MCP 进程。远程 API 使用 HTTPS。

## 3. 用自带客户端验证

在另一个终端进入项目根目录。以下客户端会自动启动 MCP 服务子进程、建立连接，并在结束时关闭它：

```bash
# 发现三个工具并显示输入和输出 Schema
uv run --extra mcp ai-task-manager-mcp-client

# 查询当前用户的任务
uv run --extra mcp ai-task-manager-mcp-client list_tasks

# 创建一条任务（会实际写入数据库）
uv run --extra mcp ai-task-manager-mcp-client create_task --arguments '{"title":"Prepare MCP demo","description":"Show task tools"}'

# 先从查询结果获取真实 ID；下面以 ID=1 为例
uv run --extra mcp ai-task-manager-mcp-client complete_task --arguments '{"task_id":1}'
```

以上 JSON 命令可直接在 WSL/Ubuntu 的 Bash 中运行。
成功结果包含 `structuredContent`；工具错误返回 `isError: true`，客户端同时以非零状态退出。

独立运行服务的命令是：

```bash
uv run --extra mcp ai-task-manager-mcp
```

stdio 服务会等待客户端输入；没有网页或启动提示属于正常现象。
不要在服务端用 `print()` 输出调试信息，stdout 用于传输 MCP 消息。

## 4. 配置到支持 MCP 的应用

对采用 `mcpServers` 格式的客户端，可参考下列配置；其他客户端使用各自的配置格式。
将 `/absolute/path/ai-task-manager` 换成你的实际项目目录：

```json
{
  "mcpServers": {
    "ai-task-manager": {
      "command": "uv",
      "args": [
        "--directory", "/absolute/path/ai-task-manager",
        "run", "--extra", "mcp", "ai-task-manager-mcp"
      ]
    }
  }
}
```

`uv` 必须位于客户端能访问的 PATH 中，也可填写它的绝对路径。
配置中的命令应在项目所在的同一个环境执行；如果项目在 WSL 中，客户端也需要通过 WSL 启动该命令。
服务从项目 `.env` 读取凭证，不要把真实 token 提交到版本库。

接入后可以要求客户端“查询我的任务”或“创建一条准备面试的任务”，
由宿主应用的模型选择工具。读写标记是供客户端参考的提示，并非服务端的权限控制。

## 5. 测试

仅运行 MCP 测试，不需要启动 PostgreSQL，也不会访问你的真实任务：

```bash
uv run --extra mcp python -m pytest tests/mcp --confcutdir=tests/mcp -q
```

测试覆盖实际 MCP 调用、FastAPI 接口、临时 SQLite 数据库、登录鉴权、跨用户操作拒绝、
参数校验、上游错误、超时、响应格式异常和独立 stdio 子进程的工具发现。
完整测试沿用原项目 PostgreSQL 测试库；CI 已配置安装 `mcp` extra。

## 本次实现的范围

这是一个实际可运行的 **MCP 服务端 + 演示客户端**。演示客户端按命令执行工具，
不调用 LLM，也没有修改 `qa_service.py` 或让微调后的 Qwen3 自动选择工具。
项目已有的模型问答和这三个 MCP 工具可以独立使用。

单用户 stdio 服务适合本地宿主启动。本实现未开放远程 MCP HTTP 端点，
也未实现多用户 MCP OAuth、长期记忆或多智能体协作。

参考：[官方 MCP Python SDK](https://py.sdk.modelcontextprotocol.io/)、
[工具定义](https://py.sdk.modelcontextprotocol.io/servers/tools/)、
[客户端](https://py.sdk.modelcontextprotocol.io/client/)。
