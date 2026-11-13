import { useRef, useState, type FormEvent } from 'react'
import { Bot, Send, CheckCircle2, Sparkles } from 'lucide-react'
import './AgentConversationPanel.css'


type DemoTask = {
  id: number
  title: string
  completed: boolean
}

type Props = {
  tasks: DemoTask[]
  onCreateTask: (title: string) => void
  onCompleteTask: (id: number) => void
  onDeleteTask: (id: number) => void
}

type ToolEvent = {
  name: string
  arguments: Record<string, unknown>
  result: Record<string, unknown>
}

type Message = {
  id: number
  role: 'user' | 'assistant'
  text: string
  tool?: ToolEvent
}

export default function DemoAgentPanel({
  tasks, onCreateTask, onCompleteTask, onDeleteTask,
}: Props) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingDelete, setPendingDelete] = useState<DemoTask | null>(null)
  const nextId = useRef(0)

  function append(
    role: Message['role'],
    text: string,
    tool?: ToolEvent,
  ) {
    setMessages(current => [
      ...current,
      { id: ++nextId.current, role, text, tool },
    ])
  }

  function findTask(input: string): DemoTask | undefined {
    const idMatch = input.match(/#(\d+)/)
    if (idMatch) {
      return tasks.find(t => t.id === Number(idMatch[1]))
    }

    const named = tasks.find(t => input.includes(t.title))
    if (named) return named

    if (/第一项|第一个|first/i.test(input)) {
      return tasks.find(t => !t.completed)
    }

    return undefined
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = question.trim()
    if (!text) return

    setQuestion('')
    setPendingDelete(null)
    append('user', text)

    if (/删除|移除|\bdelete\b|\bremove\b/i.test(text)) {
      const task = findTask(text)

      if (!task) {
        append('assistant', '请指定要删除的任务名称或编号')
        return
      }

      setPendingDelete(task)
      append(
        'assistant',
        `准备删除「${task.title}」，请确认`
      )
      return
    }

    if (/完成|办完|标记|\bcomplete\b|\bdone\b|\bfinish\b/i.test(text)) {
      const task = findTask(text)

      if (!task) {
        append('assistant', '请指定要完成的任务名称或编号')
        return
      }

      onCompleteTask(task.id)

      append('assistant', `已将「${task.title}」标记为完成。`, {
        name: 'complete_task',
        arguments: { task_id: task.id },
        result: { completed: true },
      })
      return
    }

    if (/创建|新建|添加|安排|\bcreate\b|\badd\b/i.test(text)) {
      const colon = text.match(/[：:](.+)$/)

      const title = (
        colon
          ? colon[1]
          : text
              .replace(/^(?:请)?(?:帮我)?(?:创建|新建|添加|安排)(?:一个|一条|一项)?(?:任务)?/i, '')
              .replace(/^(?:please\s+)?(?:create|add)\s+(?:a\s+)?(?:new\s+)?task\s*/i, '')
      ).trim().replace(/[。.!！]+$/, '')

      if (!title) {
        append('assistant', '请告诉我要创建的任务名称。')
        return
      }

      onCreateTask(title)

      append('assistant', `已创建任务「${title}」`, {
        name: 'create_task',
        arguments: { title },
        result: { created: true },
      })
      return
    }

    if (/任务|列表|查看|查询|\blist\b|\bshow\b/i.test(text)) {
      const active = tasks.filter(t => !t.completed)
      const summary = tasks.length
        ? tasks.map(t => `${t.completed ? '✓' : '○'} ${t.title}`).join('\n')
        : '当前没有任务。'

      append(
        'assistant',
        `当前共 ${tasks.length} 项任务，${active.length} 项未完成。\n${summary}`,
        {
          name: 'list_tasks',
          arguments: {},
          result: { count: tasks.length },
        }
      )
      return
    }

    append(
      'assistant',
      '这是离线交互演示，请尝试下方的示例指令'
    )
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const task = pendingDelete

    onDeleteTask(task.id)
    setPendingDelete(null)

    append('assistant', `已删除任务「${task.title}」。`, {
      name: 'delete_task',
      arguments: { task_id: task.id },
      result: { deleted: true },
    })
  }

  return (
    <div className="agent-chat" style={{ padding: 16 }}>
      <p style={{ fontSize: 13, opacity: 0.75 }}>
        模拟执行
      </p>

      <div className="chat-messages" style={{ minHeight: 260 }}>
        <div className="chat-thread">
          {/* {messages.length === 0 && (
            <div className="agent-empty">
              <Bot size={28} />
              <h3>有什么需要安排的？</h3>
            </div>
          )} */}
          {messages.length === 0 && (
            <div className="agent-empty agent-empty-hero">
              <div className="agent-empty-icon">
                <Bot size={30} />
                <Sparkles size={14} className="agent-empty-spark" />
              </div>

              <div className="agent-empty-kicker">Agent Demo</div>

              <h3>有什么需要安排的？</h3>
            </div>
          )}
          {messages.map(message => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-avatar">
                {message.role === 'assistant' ? <Bot size={18} /> : '你'}
              </div>

              <div className="message-content">
                <div className="message-label">
                  {message.role === 'assistant' ? '任务助手 · 模拟' : '你'}
                </div>

                <div className="message-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                  {message.text}
                </div>

                {message.tool && (
                  <details className="tool-event">
                    <summary>
                      <CheckCircle2 size={14} />
                      {' '}模拟工具：{message.tool.name}
                    </summary>
                    <pre>{JSON.stringify(message.tool, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          ))}

          {pendingDelete && (
            <div className="agent-approval demo-agent-approval">
              <strong>请确认</strong>
              <p>{pendingDelete.title}</p>
              <div className="agent-approval-actions">
                <button
                  type="button"
                  className="delete-button"
                  onClick={confirmDelete}
                >
                  确认删除
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setPendingDelete(null)
                    append('assistant', '已取消删除')
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        {[
          '查看我的任务',
          '创建任务：筹划新品发布',
          '完成筹划新品发布任务',
          '删除筹划新品发布任务',
        ].map(example => (
          <button
            key={example}
            type="button"
            className="secondary-button"
            onClick={() => setQuestion(example)}
          >
            {example}
          </button>
        ))}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label="演示任务指令"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          placeholder=""
          style={{
            flex: 1,
            minWidth: 0,
            padding: 12,
            border: '1px solid #999',
            borderRadius: 8,
          }}
        />
        <button type="submit" className="primary-button" disabled={!question.trim()}>
          <Send size={16} /> 发送
        </button>
      </form>
    </div>
  )
}
