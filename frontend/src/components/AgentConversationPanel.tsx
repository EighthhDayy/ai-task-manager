import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Bot, LoaderCircle, Plus, RefreshCw, Send } from 'lucide-react'
import {
  api, ApiError, type AgentAnswer, type AgentConversation, type AgentMessage, type AgentTurnInput,
} from '../lib/api'
import './AgentConversationPanel.css'

type Props = {
  token: string
  userId: number | null
  demo: boolean
  onTasksChanged: () => Promise<void>
  onBusyChange: (busy: boolean) => void
}

const TOOL_NAMES: Record<string, string> = {
  list_tasks: '查询任务', create_task: '创建任务',
  complete_task: '更新任务状态', delete_task: '删除任务',
}
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' })
const RUN_STATUS: Record<string, string> = {
  running: '执行中或等待恢复', pending_approval: '等待确认', completed: '已完成',
  failed: '执行失败', partial_failure: '部分操作完成', interrupted: '执行已中断', error: '本轮未全部完成',
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请重试。'
}

export default function AgentConversationPanel({ token, userId, demo, onTasksChanged, onBusyChange }: Props) {
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [olderCursor, setOlderCursor] = useState<number | null>(null)
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState<AgentTurnInput | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [runs, setRuns] = useState<Record<string, AgentAnswer>>({})
  const scope = useRef(0)
  const busy = useRef(false)
  const end = useRef<HTMLDivElement>(null)
  const storageKey = `atm:agent:${userId}`

  function readPending(): AgentTurnInput | null {
    const raw = localStorage.getItem(`${storageKey}:pending`)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const item = value as Record<string, unknown>
    if (typeof item.prompt !== 'string' || typeof item.request_id !== 'string') return null
    if (item.conversation_id !== null && typeof item.conversation_id !== 'string') return null
    return item as AgentTurnInput
  }

  function rememberConversation(id: string | null) {
    if (id) localStorage.setItem(`${storageKey}:conversation`, id)
    else localStorage.removeItem(`${storageKey}:conversation`)
    setSelectedId(id)
  }

  function clearPending(requestId: string) {
    if (readPending()?.request_id === requestId) localStorage.removeItem(`${storageKey}:pending`)
    setPending(null)
  }

  async function loadMessages(id: string, version: number, beforeId?: number) {
    const page = await api.agentMessages(token, id, beforeId)
    if (scope.current !== version) return
    if (beforeId) setMessages(current => [...page.messages, ...current])
    else setMessages(page.messages)
    setOlderCursor(page.next_before_id)
    const receipts = await Promise.all(page.messages.filter(message => message.role === 'assistant' &&
      ['pending_approval', 'running', 'interrupted', 'partial_failure'].includes(message.status || ''))
      .map(message => api.agentReceipt(token, message.request_id)))
    if (scope.current !== version) return
    setRuns(current => {
      const next = { ...current }
      for (const message of page.messages) delete next[message.request_id]
      return { ...next, ...Object.fromEntries(receipts.map(receipt => [receipt.request_id, receipt])) }
    })
  }

  useEffect(() => {
    const version = ++scope.current
    if (demo || !token || userId === null) return
    busy.current = true
    setLoading(true)
    async function initialize() {
      try {
        const outstanding = readPending()
        setPending(outstanding)
        const list = await api.agentConversations(token)
        if (scope.current !== version) return
        setConversations(list)
        setHasMore(list.length === 20)
        let id = localStorage.getItem(`${storageKey}:conversation`) || list[0]?.id || null
        if (outstanding) {
          try {
            const receipt = await api.agentReceipt(token, outstanding.request_id)
            if (scope.current !== version) return
            id = receipt.conversation_id
            clearPending(outstanding.request_id)
          } catch (receiptError) {
            if (!(receiptError instanceof ApiError && receiptError.status === 404)) throw receiptError
            id = outstanding.conversation_id
            setError('有一轮请求尚未确认结果，请使用原请求重试。')
          }
        }
        if (scope.current !== version) return
        rememberConversation(id)
        if (id) await loadMessages(id, version)
      } catch (loadError) {
        if (scope.current === version) setError(errorText(loadError))
      } finally {
        if (scope.current === version) {
          setLoading(false)
          busy.current = false
        }
      }
    }
    void initialize()
    return () => { scope.current += 1 }
  }, [token, userId, demo])

  useEffect(() => {
    onBusyChange(sending || loading)
    return () => onBusyChange(false)
  }, [sending, loading, onBusyChange])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.at(-1)?.id, pending?.request_id])

  async function selectConversation(id: string | null) {
    if (busy.current || pending) return
    busy.current = true
    const version = scope.current
    setLoading(true)
    setError('')
    setMessages([])
    setOlderCursor(null)
    try {
      rememberConversation(id)
      if (id) await loadMessages(id, version)
    } catch (loadError) {
      if (scope.current === version) setError(errorText(loadError))
    } finally {
      if (scope.current === version) {
        setLoading(false)
        busy.current = false
      }
    }
  }

  async function send(request: AgentTurnInput) {
    if (busy.current || demo || !token || userId === null) return
    const version = scope.current
    try {
      const existing = readPending()
      if (existing && existing.request_id !== request.request_id) {
        setPending(existing)
        setError('另一个窗口有待确认的请求，请先重试该请求。')
        return
      }
      localStorage.setItem(`${storageKey}:pending`, JSON.stringify(request))
    } catch {
      setError('无法保存本次请求的恢复标记，请检查浏览器存储后重试。')
      return
    }
    busy.current = true
    setSending(true)
    setPending(request)
    setQuestion('')
    setError('')
    let saved = false
    try {
      const answer = await api.askAgent(token, request.prompt, request.request_id, request.conversation_id)
      if (scope.current !== version) return
      saved = true
      rememberConversation(answer.conversation_id)
      clearPending(request.request_id)
      await loadMessages(answer.conversation_id, version)
      const list = await api.agentConversations(token)
      if (scope.current !== version) return
      setConversations(list)
      setHasMore(list.length === 20)
      await onTasksChanged()
    } catch (sendError) {
      if (scope.current !== version) return
      if (!saved && sendError instanceof ApiError && [400, 401, 403, 404, 422].includes(sendError.status)) {
        clearPending(request.request_id)
        setQuestion(request.prompt)
      }
      setError(saved ? '本轮已保存，但历史加载失败。请刷新当前对话。' : errorText(sendError))
    } finally {
      if (scope.current === version) {
        setSending(false)
        busy.current = false
      }
    }
  }

  async function loadMore(older: boolean) {
    if (busy.current || pending) return
    busy.current = true
    const version = scope.current
    setLoading(true)
    setError('')
    try {
      if (older && selectedId && olderCursor) await loadMessages(selectedId, version, olderCursor)
      else {
        const next = await api.agentConversations(token, conversations.length)
        if (scope.current !== version) return
        setConversations(current => [...current, ...next])
        setHasMore(next.length === 20)
      }
    } catch (loadError) {
      if (scope.current === version) setError(errorText(loadError))
    } finally {
      if (scope.current === version) {
        setLoading(false)
        busy.current = false
      }
    }
  }

  async function actOnRun(run: AgentAnswer, actionId?: string, approve?: boolean) {
    if (busy.current || !run.run_id) return
    busy.current = true
    setSending(true)
    setError('')
    const version = scope.current
    try {
      const result = actionId ? await api.agentDecision(token, run.run_id, actionId, approve === true)
        : await api.resumeAgent(token, run.run_id)
      if (scope.current !== version) return
      setRuns(current => ({ ...current, [result.request_id]: result }))
      await loadMessages(result.conversation_id, version)
      await onTasksChanged()
    } catch (actionError) {
      if (scope.current === version) setError(errorText(actionError))
    } finally {
      if (scope.current === version) { setSending(false); busy.current = false }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!question.trim() || pending) return
    void send({ prompt: question.trim(), request_id: crypto.randomUUID(), conversation_id: selectedId })
  }

  if (demo) return <div className="agent-demo">登录账户后，可以创建对话、恢复历史，并连续管理任务。</div>
  if (userId === null) return <div className="agent-demo">正在加载账户…</div>

  return <div className="agent-memory">
    <aside className="agent-history" aria-label="历史对话">
      <button className="secondary-button" type="button" disabled={loading || sending || Boolean(pending)} onClick={() => void selectConversation(null)}><Plus size={15} /> 新建对话</button>
      <h4>历史对话</h4>
      <div className="agent-history-list">
        {conversations.map(item => <button key={item.id} className={selectedId === item.id ? 'selected' : ''} disabled={loading || sending || Boolean(pending)} onClick={() => void selectConversation(item.id)}>
          <strong>{item.title}</strong><small>{dateFormat.format(new Date(item.updated_at))}</small>
        </button>)}
        {!loading && !conversations.length && <p>第一轮对话保存后会出现在这里。</p>}
        {hasMore && <button type="button" disabled={loading || sending || Boolean(pending)} onClick={() => void loadMore(false)}>更多对话</button>}
      </div>
    </aside>
    <div className="agent-chat">
      <div className="agent-conversation-heading"><span>{selectedId ? '当前对话' : '新对话'}</span>
        <button className="icon-button" aria-label="刷新当前对话" disabled={!selectedId || loading || sending || Boolean(pending)} onClick={() => void selectConversation(selectedId)}><RefreshCw size={15} /></button>
      </div>
      <div className="chat-messages" aria-busy={sending || loading}>
        <div className="chat-thread">
          {olderCursor && <button className="text-link" disabled={loading || sending || Boolean(pending)} onClick={() => void loadMore(true)}>加载更早的消息</button>}
          {!messages.length && !pending && <div className="agent-empty"><Bot size={30} /><h3>有什么需要安排的？</h3></div>}
          {messages.map(message => <div key={message.id} className={`message ${message.role}`}>
            <div className="message-avatar">{message.role === 'assistant' ? <Bot size={19} /> : '你'}</div>
            <div className="message-content">
              <div className="message-label">{message.role === 'assistant' ? '任务助手' : '你'}{message.status && message.status !== 'completed' ? ` · ${RUN_STATUS[message.status] || message.status}` : ''}</div>
              <div className="message-bubble">{message.content}</div>
              {message.role === 'assistant' && runs[message.request_id]?.pending_approvals?.map(action => <div className="agent-approval" key={action.action_id} role="group" aria-label="确认删除任务">
                <strong>确认删除任务 #{String(action.arguments.task_id)}</strong>
                <p>操作：{TOOL_NAMES[action.tool_name] || action.tool_name}（{action.tool_name}）</p>
                <p>高风险操作：删除后无法撤销，请核对任务编号后确认。</p>
                <div className="agent-approval-actions">
                  <button type="button" className="delete-button" disabled={loading || sending} onClick={() => void actOnRun(runs[message.request_id], action.action_id, true)}>确认删除</button>
                  <button type="button" className="secondary-button" disabled={loading || sending} onClick={() => void actOnRun(runs[message.request_id], action.action_id, false)}>拒绝</button>
                </div>
              </div>)}
              {message.role === 'assistant' && runs[message.request_id] &&
                ['running', 'interrupted', 'partial_failure'].includes(runs[message.request_id].status) && <div className="agent-approval">
                  <p>已完成的操作会保留。{runs[message.request_id].last_error?.category === 'non_retryable' ? '本轮无法恢复，请核对记录后发起新请求。' : '可检查保存的状态并继续执行。'}</p>
                  {runs[message.request_id].last_error?.category !== 'non_retryable' && <button type="button" className="secondary-button" disabled={loading || sending} onClick={() => void actOnRun(runs[message.request_id])}>检查并继续</button>}
                </div>}
              {message.tool_events.length > 0 && <div className="tool-event-list" aria-label="任务工具执行记录">
                {message.tool_events.map((event, index) => <details className="tool-event" key={index}>
                  <summary><span className="tool-event-name" title={event.name}>{TOOL_NAMES[event.name] ?? event.name}</span><span className="tool-event-status">{event.status === 'error' ? '未完成' : '成功'}</span></summary>
                  {event.arguments && <div className="tool-event-section"><strong>调用参数</strong><pre>{JSON.stringify(event.arguments, null, 2)}</pre></div>}
                  {'result' in event && <div className="tool-event-section"><strong>返回结果</strong><pre>{JSON.stringify(event.result, null, 2)}</pre></div>}
                </details>)}
              </div>}
            </div>
          </div>)}
          {pending && <div className="message user"><div className="message-avatar">你</div><div className="message-content"><div className="message-label">{sending ? '处理中…' : '结果待确认'}</div><div className="message-bubble">{pending.prompt}</div></div></div>}
          <div ref={end} />
        </div>
      </div>
      {error && <div className="agent-error" role="alert"><AlertCircle size={15} /><span>{error}</span>{pending && <button className="text-link" type="button" disabled={sending || loading} onClick={() => void send(pending)}>重试原请求</button>}</div>}
      <form className="chat-composer" onSubmit={submit}>
        <div className="composer-box">
          <textarea aria-label="任务助手消息" rows={2} maxLength={8000} value={question} disabled={loading || sending || Boolean(pending)} onChange={event => setQuestion(event.target.value)} placeholder="输入你的想法或任务…（Enter 发送，Shift+Enter 换行）" onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (question.trim() && !pending) void send({ prompt: question.trim(), request_id: crypto.randomUUID(), conversation_id: selectedId })
            }
          }} />
          <div className="composer-footer"><span>对话会保存到当前账户</span><button type="submit" aria-label="发送任务消息" disabled={!question.trim() || loading || sending || Boolean(pending)}>{sending ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</button></div>
        </div>
      </form>
    </div>
  </div>
}
