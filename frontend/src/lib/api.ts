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
export type AgentAnswer = { answer: string; tool_events: AgentToolEvent[] }
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
  if (typeof body?.detail === 'string') return body.detail
  if (Array.isArray(body?.detail)) return body.detail.map(x => x.msg || 'Invalid input').join('; ')
  if (status === 401) return '登录已过期，请重新登录。'
  if (status === 503) return '后端模型服务暂不可用，请检查配置。'
  return `请求失败（HTTP ${status}）`
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
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
    throw new ApiError(0, '无法连接 FastAPI，请确认后端已启动（默认端口 8000）。')
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

export const api = {
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
  askAgent: async (token: string, prompt: string, requestId = crypto.randomUUID()): Promise<AgentAnswer> => {
    const payload = await request<unknown>('/ai/agent', {
      method: 'POST', body: JSON.stringify({ prompt, request_id: requestId }),
    }, token)
    const answer = extractAgentAnswer(payload)
    if (!answer) throw new ApiError(200, 'Agent 已响应，但返回格式无法识别；请检查 /ai/agent 的 Response Body。')
    return { answer, tool_events: extractToolEvents(payload) }
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
