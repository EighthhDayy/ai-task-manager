import { DEMO_ONLY } from './demoMode'

export type RagSource = {
  chunk_id: string
  source_id: string
  filename: string | null
  page_number: number | null
  text: string
}

export type RagAnswer = {
  answer: string
  retrieved_chunk_ids: string[]
  sources?: RagSource[]
}

export type Task = {
  id: number
  title: string
  description: string | null
  completed: boolean
  user_id: number
}

export type User = { id: number; username: string }

export type DocumentUploadJob = {
  job_id: string
  status: string
}

export type IndexedDocument = {
  id: number
  source_id: string
  filename: string | null
  indexed_at: string | null
  chunk_count: number
}

export type DocumentJobStatus = {
  job_id: string
  status: string
  result?: unknown
  error?: string | null
}

export type ChatAnswer = { answer: string; model: string; source_url: string }
export type AgentToolEvent = {
  name: string
  arguments?: Record<string, unknown>
  result?: unknown
  status?: 'success' | 'error'
}
export type AgentAnswer = {
  answer: string
  conversation_id: string
  request_id: string
  status: 'running' | 'pending_approval' | 'completed' | 'failed' | 'partial_failure' | 'interrupted' | 'error'
  replayed: boolean
  tool_events: AgentToolEvent[]
  run_id?: string
  pending_approvals?: { action_id: string; tool_name: string; arguments: Record<string, unknown>; risk: string }[]
  last_error?: { category: string; code: string; tool?: string | null } | null
}
export type AgentConversation = {
  id: string
  title: string
  created_at: string
  updated_at: string
}
export type AgentMessage = {
  id: number
  request_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  tool_events: AgentToolEvent[]
  status: string | null
}
export type AgentMessagePage = {
  conversation: AgentConversation
  messages: AgentMessage[]
  has_more: boolean
  next_before_id: number | null
}
export type AgentTurnInput = { prompt: string; request_id: string; conversation_id: string | null }
export type TaskInput = { title: string; description: string | null; completed: boolean }

type ErrorBody = { detail?: string | { msg?: string }[] | unknown }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export function apiUrl(path: string) {
  return `${BASE}${path}`
}

function detailMessage(body: ErrorBody | null, status: number): string {
  if (typeof body?.detail === 'string') {
    const message = ERROR_MESSAGES[body.detail]
    if (message) return message
    if (/[\u4e00-\u9fff]/.test(body.detail)) return body.detail
  }
  if (status === 401) return '登录已过期，请重新登录。'
  if (status === 403) return '当前账户没有执行此操作的权限。'
  if (status === 404) return '请求的内容不存在，请刷新后重试。'
  if (status === 409) return '内容发生冲突，请检查后重试。'
  if (status === 413) return '上传文件超过大小限制。'
  if (status === 422) return '输入内容不符合要求，请检查填写的信息。'
  if (status === 503) return '服务暂时不可用，请稍后重试。'
  return `请求失败（HTTP ${status}）`
}

const ERROR_MESSAGES: Record<string, string> = {
  'The model or search service is temporarily unavailable. Please try again later.': '模型或搜索服务暂时不可用，请稍后重试。',
  'Agent run not found': '执行记录不存在或当前账户无权访问。',
  'Agent action not found': '操作不存在或当前账户无权访问。',
  'Approval decision already recorded': '这项操作已有确认结果，请刷新状态。',
  'Action is not awaiting approval': '这项操作当前无需确认，请刷新状态。',
  'This run cannot be safely resumed': '本轮无法安全恢复，请查看已完成操作后发起新请求。',
  'Recovery attempt limit reached': '已达到本轮恢复次数上限，请核对操作记录后发起新请求。',
  'Conversation not found': '对话不存在或当前账户无权访问。',
  'Agent request not found': '本轮请求尚未保存，请使用原请求重试。',
  'Agent request is still running': '上一轮请求仍在处理中，请稍后使用原请求重试。',
  'Agent request_id conflicts with an earlier request': '请求编号与之前的内容不一致，请恢复原请求。',
  'Agent turn could not be confirmed; retry with the same request_id': '本轮保存结果尚未确认，请点击“重试原请求”。',
  'Invalid username or password': '用户名或密码不正确。',
  'Username or email already exists': '用户名或邮箱已被注册。',
  'Token expired': '登录已过期，请重新登录。',
  'Invalid token': '登录信息无效，请重新登录。',
  'Not authenticated': '请先登录。',
  'User not found': '账户不存在，请重新登录。',
  'Task not found': '任务不存在，请刷新列表。',
  'Document not found': '文档不存在，请刷新列表。',
  'Job not found': '处理任务不存在或已过期，请刷新文档列表。',
  'Invalid source_id': '文档来源编号无效。',
  'source_id and text cannot be empty': '文档来源编号和内容不能为空。',
  'Only PDF files are supported': '只支持上传 PDF 文件。',
  'PDF exceeds 5 MB': 'PDF 文件不能超过 5 MB。',
  'Invalid PDF file': '文件不是有效的 PDF。',
  'Encrypted PDFs are not supported': '暂不支持加密的 PDF，请解密后再上传。',
  'PDF exceeds 30 pages': 'PDF 不能超过 30 页。',
  'PDF exceeds 10 OCR pages': '需要文字识别的页面不能超过 10 页。',
  'PDF is damaged or unsupported': 'PDF 已损坏或格式不受支持。',
  'No text could be extracted, including by OCR': '无法从这份 PDF 提取文字。',
  'Extracted text is too long': 'PDF 提取的文字超出长度限制。',
  'AI access requires approval': '真实 AI 功能需要账号授权。你可以先体验演示模式，或联系项目作者开通。',
  'AI is disabled': '真实 AI 服务暂时关闭，普通任务管理仍可使用。',
  'AI quota or concurrency limit reached': 'AI 调用额度已用完或服务繁忙，请稍后重试。',
  'AI quota service is unavailable': 'AI 额度服务暂时不可用，请稍后重试。',
  'Document upload quota reached': '今日文档处理额度已用完，请稍后再试。',
  'Document queue is full': '文档处理队列已满，请稍后再试。',
  'AI service is temporarily unavailable': '智能助手暂时不可用，请稍后重试。',
  'RAG service is temporarily unavailable': '文档问答暂时不可用，请稍后重试。',
  'Document list is temporarily unavailable': '文档列表暂时无法加载，请稍后重试。',
  'Document deletion is temporarily unavailable': '文档暂时无法删除，请稍后重试。',
  'Embedding service is temporarily unavailable': '向量索引服务暂时不可用，请稍后重试。',
  'Document indexing is temporarily unavailable': '文档暂时无法建立索引，请稍后重试。',
  'Document queue is unavailable': '文档处理服务暂时不可用，请稍后重试。',
  'Transformer QA service is not configured.': 'Qwen3 问答服务尚未配置。',
  'Wikipedia retrieval timed out.': '知识检索超时，请稍后重试。',
  'Wikipedia retrieval failed.': '知识检索失败，请稍后重试。',
  'No relevant Wikipedia passage was found.': '没有检索到相关的维基百科内容，请调整问题后重试。',
  'Qwen3 inference timed out.': 'Qwen3 回答超时，请稍后重试。',
  'Qwen3 inference failed.': 'Qwen3 暂时无法回答，请稍后重试。',
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  if (DEMO_ONLY) throw new ApiError(0, '纯前端演示不连接真实 API。')
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(0, '暂时无法连接服务，请检查网络或稍后重试。')
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, detailMessage(body, response.status))
  return body as T
}

// Support the existing endpoint returning a JSON string, or a small response object.
// Do not invent tool execution traces: the current endpoint exposes only the final text.
function extractAgentAnswer(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['answer', 'response', 'output_text', 'message', 'result']) {
      const field = obj[key]
      if (typeof field === 'string' && field.trim()) return field.trim()
    }
  }
  return ''
}

// Accept only backend-supplied traces. Never infer tool execution from the model's prose.
function extractToolEvents(payload: unknown): AgentToolEvent[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const raw = (payload as Record<string, unknown>).tool_events
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).name === 'string'
  ).map(item => ({
    name: item.name as string,
    ...(item.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)
      ? { arguments: item.arguments as Record<string, unknown> } : {}),
    ...(Object.prototype.hasOwnProperty.call(item, 'result') ? { result: item.result } : {}),
    ...(item.status === 'success' || item.status === 'error'
      ? { status: item.status } : {}),
  }))
}

export type Capabilities = { qwen_configured: boolean; ai_enabled: boolean; ai_requires_approval: boolean }

export const api = {
  agentRun: (token: string, runId: string) =>
    request<AgentAnswer>(`/ai/agent/runs/${encodeURIComponent(runId)}`, {}, token),
  agentDecision: (token: string, runId: string, actionId: string, approve: boolean) =>
    request<AgentAnswer>(`/ai/agent/runs/${encodeURIComponent(runId)}/decision`,
      { method: 'POST', body: JSON.stringify({ action_id: actionId, approve }) }, token),
  resumeAgent: (token: string, runId: string) =>
    request<AgentAnswer>(`/ai/agent/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' }, token),
  capabilities: () => request<Capabilities>('/capabilities'),
  agentConversations: (token: string, offset = 0) =>
    request<AgentConversation[]>(`/ai/agent/conversations?offset=${offset}&limit=20`, {}, token),
  agentMessages: (token: string, id: string, beforeId?: number) =>
    request<AgentMessagePage>(
      `/ai/agent/conversations/${encodeURIComponent(id)}/messages${beforeId ? `?before_id=${beforeId}` : ''}`,
      {}, token,
    ),
  agentReceipt: (token: string, requestId: string) =>
    request<AgentAnswer>(`/ai/agent/requests/${encodeURIComponent(requestId)}`, {}, token),
  listDocuments: (token: string) =>
    request<IndexedDocument[]>('/ai/documents', {}, token),
  deleteDocument: (token: string, id: number) =>
    request<void>(`/ai/documents/${id}`, { method: 'DELETE' }, token),
  askDocs: (token: string, question: string) =>
    request<RagAnswer>('/ai/ask-docs', { method: 'POST', body: JSON.stringify({ question }) }, token),
  uploadPdfAsync: (
    token: string,
    file: File,
    sourceId: string,
  ) => {
    const formData = new FormData()

    formData.append('source_id', sourceId)
    formData.append('file', file, file.name)

    return request<DocumentUploadJob>(
      '/ai/documents/upload-async',
      {
        method: 'POST',
        body: formData,
      },
      token,
    )
  },
  getDocumentJob: (token: string, jobId: string) =>
    request<DocumentJobStatus>(
      `/ai/document-jobs/${encodeURIComponent(jobId)}`,
      {},
      token,
    ),
  login: (username: string, password: string) =>
    request<{ access_token: string; token_type: string }>('/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  register: (username: string, email: string, password: string) =>
    request('/users', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  me: (token: string) => request<User>('/me', {}, token),
  tasks: (token: string) => request<Task[]>('/my/tasks', {}, token),
  createTask: (token: string, task: TaskInput) =>
    request<Task>('/my/tasks', { method: 'POST', body: JSON.stringify(task) }, token),
  updateTask: (token: string, id: number, update: Partial<TaskInput>) =>
    request<Task>(`/my/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(update) }, token),
  deleteTask: (token: string, id: number) =>
    request<{ message: string }>(`/my/tasks/${id}`, { method: 'DELETE' }, token),
  askQwen: (token: string, question: string) =>
    request<ChatAnswer>('/ai/Qwen3-qa', { method: 'POST', body: JSON.stringify({ question }) }, token),
  // Original FastAPI Agent: AgentRequest(prompt: str, request_id: UUID).
  // Generate a fresh id for each deliberate new user action, not a reused constant.
  // If a timed-out write is retried, reuse the original requestId where possible.
  askAgent: async (
    token: string, prompt: string, requestId: string = crypto.randomUUID(), conversationId: string | null = null,
  ): Promise<AgentAnswer> => {
    const payload = await request<unknown>('/ai/agent', {
      method: 'POST', body: JSON.stringify({ prompt, request_id: requestId, conversation_id: conversationId }),
    }, token)
    const answer = extractAgentAnswer(payload)
    if (!answer) throw new ApiError(200, 'Agent 已响应，但返回格式无法识别；请检查 /ai/agent 的 Response Body。')
    const result = payload as Record<string, unknown>
    if (typeof result.conversation_id !== 'string') {
      throw new ApiError(200, '后端尚未返回会话编号，请确认已更新后端并执行数据库迁移。')
    }
    return {
      run_id: typeof result.run_id === 'string' ? result.run_id : undefined,
      pending_approvals: result.pending_approvals as AgentAnswer['pending_approvals'],
      last_error: result.last_error as AgentAnswer['last_error'],
      answer, conversation_id: result.conversation_id, request_id: requestId,
      status: typeof result.status === 'string' ? result.status as AgentAnswer['status'] : 'completed',
      replayed: result.replayed === true, tool_events: extractToolEvents(payload),
    }
  },
}

export function safeWebUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
