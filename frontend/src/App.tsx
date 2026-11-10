import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Bot, Check,
  CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle,
  Clock3, CloudUpload, Database, FileText, FolderOpen, Github, HelpCircle,
  LayoutDashboard, ListTodo, LoaderCircle, LockKeyhole, LogOut, Menu, MessageCircle,
  MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, SquarePen,
  Trash2, WandSparkles, X, Zap,
} from 'lucide-react'
import { api, apiUrl, ApiError, safeWebUrl, type ChatAnswer, type AgentToolEvent, type Task, type TaskInput, type User } from './lib/api'
import { Button } from './components/ui/button'

type Page = 'overview' | 'tasks' | 'assistant' | 'knowledge' | 'settings'
type Filter = 'all' | 'active' | 'done'
type Message = { id: number; role: 'user' | 'assistant'; text: string; model?: string; source?: string; example?: boolean; toolEvents?: AgentToolEvent[] }

// Deliberately identified as sample data; never blended with API tasks.
const DEMO_TASKS: Task[] = [
  { id: 101, user_id: 0, title: '完善 Agent 工作流与工具调用', description: '梳理任务状态流转和工具调用异常场景', completed: false },
  { id: 102, user_id: 0, title: '整理 RAG 知识库文档', description: '准备示例 PDF，检查分块和检索结果', completed: false },
  { id: 103, user_id: 0, title: '设计任务管理前端', description: '完成工作台、任务列表和登录交互', completed: true },
  { id: 104, user_id: 0, title: '补充 FastAPI 接口测试', description: '覆盖任务创建、更新和权限校验', completed: false },
  { id: 105, user_id: 0, title: '集成 Qwen3 问答服务', description: '测试问答和来源链接返回', completed: true },
  { id: 106, user_id: 0, title: '完善项目 README', description: '补充部署说明、架构图和截图', completed: false },
  { id: 107, user_id: 0, title: '完成 MCP 工具专项测试', description: '验证参数校验与越权拦截', completed: true },
]

const qaExamples = ['When was Rihanna born?', '什么是 RAG 中的向量检索？', '如何设计可靠的 Agent 工具调用？']
const agentExamples = ['帮我创建任务：测试 FastAPI 登录接口', '列出我尚未完成的任务', '列出我的任务，告诉我每个任务的编号']

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark"><CheckCheck size={22} strokeWidth={3} /></div>
      {!compact && <div className="brand-text"><strong>taskflow<span>.ai</span></strong><small>INTELLIGENT WORKSPACE</small></div>}
    </div>
  )
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={`status-dot ${online ? 'online' : 'offline'}`} />
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-illustration">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>
}

function MetricCard({ icon, label, value, note, tint, detail }: { icon: ReactNode; label: string; value: string | number; note: string; tint: string; detail?: ReactNode }) {
  return <article className="metric-card">
    <div className="metric-top"><span className={`metric-icon ${tint}`}>{icon}</span><span className="metric-detail">{detail || <ArrowUpRight size={17} />}</span></div>
    <p className="metric-label">{label}</p><div className="metric-value">{value}</div><p className="metric-note">{note}</p>
  </article>
}

function TaskRow({ task, onToggle, onEdit, onDelete, busy = false }: {
  task: Task; onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void; busy?: boolean
}) {
  return <div className={`task-row ${task.completed ? 'is-done' : ''}`}>
    <button className={`task-check ${task.completed ? 'checked' : ''}`} disabled={busy} aria-label={task.completed ? '标记为未完成' : '标记为已完成'} onClick={() => onToggle(task)}>
      {task.completed && <Check size={14} strokeWidth={3} />}
    </button>
    <div className="task-info"><div className="task-name">{task.title}</div><div className="task-desc">{task.description?.trim() || `Task #${task.id}`}</div></div>
    <div className={`task-status ${task.completed ? 'complete' : 'pending'}`}><span />{task.completed ? '已完成' : '进行中'}</div>
    <div className="task-actions">
      <button className="icon-button" aria-label={`编辑 ${task.title}`} title="编辑任务" onClick={() => onEdit(task)}><SquarePen size={16} /></button>
      <button className="icon-button danger-hover" aria-label={`删除 ${task.title}`} title="删除任务" onClick={() => onDelete(task)}><Trash2 size={16} /></button>
    </div>
  </div>
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>
      {children}
    </section>
  </div>
}

function AuthScreen({ onAuth, onDemo }: { onAuth: (token: string) => void; onDemo: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'register') await api.register(username.trim(), email.trim(), password)
      const result = await api.login(username.trim(), password)
      onAuth(result.access_token)
    } catch (err) { setError(err instanceof Error ? err.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  return <main className="auth-layout">
    <section className="auth-visual">
      <div className="auth-visual-top"><Brand /><span className="auth-edition">WORKSPACE / 2026</span></div>
      <div className="auth-hero-content"><div className="auth-kicker"><Sparkles size={15} /> YOUR AI-POWERED WORKSPACE</div>
        <h1>Great work starts<br />with <em>clarity.</em></h1>
        <p>让任务、知识与智能协作融为一体。<br />从规划到执行，每一步都更从容。</p>
        <div className="auth-preview">
          <div className="preview-header"><span><span className="preview-dot" /> Today's focus</span><MoreHorizontal size={18} /></div>
          <div className="preview-task"><span className="preview-check"><Check size={12} /></span><span>Ship the next big thing</span><span className="preview-chip">Done</span></div>
          <div className="preview-task"><span className="preview-ring" /><span>Build with AI, move faster</span><Sparkles size={15} color="#8b82ed" /></div>
          <div className="preview-bottom"><div className="preview-avatars"><b>A</b><b>T</b><b>✦</b></div><span>One workspace. Endless possibilities.</span></div>
        </div>
      </div>
      <div className="auth-visual-foot">DESIGNED FOR FOCUSED TEAMS <span>✦</span> POWERED BY INTELLIGENCE</div>
    </section>
    <section className="auth-form-side"><div className="auth-form-wrap">
      <div className="mobile-brand"><Brand /></div>
      <div className="auth-label"><span className="label-circle"><LockKeyhole size={15} /></span> 安全的个人工作空间</div>
      <h2>{mode === 'login' ? '欢迎回来 👋' : '创建你的工作空间'}</h2>
      <p className="auth-subtitle">{mode === 'login' ? '登录并继续你的高效工作日。' : '只需几步，即可开始管理任务。'}</p>
      <form onSubmit={submit} className="auth-form">
        <label>用户名<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入用户名" /></label>
        {mode === 'register' && <label>邮箱地址<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
        <label>密码<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 6 : undefined} required value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === 'login' ? '登录工作空间' : '注册并登录'}<ArrowRight size={18} /></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? '还没有账号？' : '已经有账号？'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '立即注册' : '返回登录'}</button></div>
      <div className="auth-divider"><span>或者</span></div>
      <button className="demo-button" onClick={onDemo}><Sparkles size={17} /> 先体验演示工作台 <ArrowUpRight size={16} /></button>
      <p className="auth-smallprint">演示模式使用明确标记的示例数据，不会连接你的后端。</p>
    </div><footer className="auth-form-foot">© 2026 Taskflow AI · Built with React & FastAPI</footer></section>
  </main>
}

function TaskEditor({ task, busy, onClose, onSave }: { task: Task | null; busy: boolean; onClose: () => void; onSave: (input: TaskInput) => Promise<void> }) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [completed, setCompleted] = useState(task?.completed || false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('请输入任务名称。'); return }
    setError('')
    try { await onSave({ title: title.trim(), description: description.trim() || null, completed }) }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败') }
  }
  return <Modal title={task ? '编辑任务' : '创建新任务'} subtitle={task ? `Task #${task.id} · 更新任务信息` : '添加一件值得完成的事'} onClose={onClose}>
    <form onSubmit={submit} className="editor-form">
      <label>任务名称 <span>*</span><input autoFocus maxLength={160} placeholder="例如：完成 Agent 工具调用集成" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>任务描述<textarea rows={4} maxLength={1500} placeholder="添加更多细节（可选）" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="checkline"><input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} />标记为已完成</label>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><Button type="submit" className="primary-button" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}{task ? '保存修改' : '创建任务'}<ArrowRight size={16} /></Button></div>
    </form>
  </Modal>
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('atm_token') || '')
  const [demo, setDemo] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<Page>('overview')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editor, setEditor] = useState<Task | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [assistantMode, setAssistantMode] = useState<'qwen' | 'agent'>('qwen')
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const messageEnd = useRef<HTMLDivElement>(null)

  const authenticated = Boolean(token) || demo
  const currentUser = demo ? { id: 0, username: 'Demo User' } : user
  const completed = tasks.filter(t => t.completed).length
  const active = tasks.length - completed
  const percentage = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
  const filtered = useMemo(() => tasks.filter(task => {
    if (filter === 'active' && task.completed) return false
    if (filter === 'done' && !task.completed) return false
    const term = search.trim().toLowerCase()
    return !term || `${task.title} ${task.description || ''}`.toLowerCase().includes(term)
  }), [tasks, filter, search])

  function toast(message: string, error = false) { setNotice({ message, error }) }
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 3800)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (!token || demo) return
    let cancelled = false
    setLoading(true)
    Promise.all([api.me(token), api.tasks(token)])
      .then(([me, allTasks]) => { if (!cancelled) { setUser(me); setTasks(allTasks) } })
      .catch(err => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem('atm_token'); setToken(''); setUser(null); setTasks([])
          toast('登录已过期，请重新登录。', true)
        } else { toast(err instanceof Error ? err.message : '无法加载数据', true) }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, demo])

  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages, asking])

  function login(nextToken: string) {
    sessionStorage.setItem('atm_token', nextToken); setDemo(false); setToken(nextToken); setPage('overview')
  }
  function startDemo() {
    setDemo(true); setToken(''); setUser(null); setTasks(DEMO_TASKS); setPage('overview'); setMessages([])
  }
  function logout() {
    sessionStorage.removeItem('atm_token'); setDemo(false); setToken(''); setTasks([]); setUser(null); setMessages([])
    setSearch(''); setSidebarOpen(false)
  }
  function navigate(next: Page) { setPage(next); setSidebarOpen(false); setSearch(''); setFilter('all') }

  async function refresh() {
    if (demo) return
    if (!token) return
    setLoading(true)
    try { setTasks(await api.tasks(token)) }
    catch (err) { toast(err instanceof Error ? err.message : '任务加载失败', true) }
    finally { setLoading(false) }
  }
  async function saveTask(input: TaskInput) {
    setSaving(true)
    try {
      if (demo) {
        if (editor === 'new') setTasks(current => [{ ...input, id: Date.now(), user_id: 0 }, ...current])
        else if (editor) setTasks(current => current.map(task => task.id === editor.id ? { ...task, ...input } : task))
      } else if (token) {
        if (editor === 'new') { const created = await api.createTask(token, input); setTasks(current => [created, ...current]) }
        else if (editor) { const updated = await api.updateTask(token, editor.id, input); setTasks(current => current.map(t => t.id === updated.id ? updated : t)) }
      }
      toast(editor === 'new' ? '任务已创建' : '任务已更新'); setEditor(null)
    } catch (err) { throw err }
    finally { setSaving(false) }
  }
  async function toggleTask(task: Task) {
    setBusyId(task.id)
    try {
      if (demo) setTasks(current => current.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t))
      else if (token) { const updated = await api.updateTask(token, task.id, { completed: !task.completed }); setTasks(current => current.map(t => t.id === updated.id ? updated : t)) }
    } catch (err) { toast(err instanceof Error ? err.message : '无法更新任务', true) }
    finally { setBusyId(null) }
  }
  async function removeTask() {
    if (!deleting) return
    setSaving(true)
    try {
      if (!demo && token) await api.deleteTask(token, deleting.id)
      setTasks(current => current.filter(t => t.id !== deleting.id))
      setDeleting(null); toast('任务已删除')
    } catch (err) { toast(err instanceof Error ? err.message : '删除失败', true) }
    finally { setSaving(false) }
  }
  function switchAssistantMode(next: 'qwen' | 'agent') {
    setAssistantMode(next)
    setMessages([])
    setQuestion('')
  }

  async function sendQuestion(raw = question) {
    const value = raw.trim()
    if (!value || asking) return
    setQuestion('')
    setMessages(current => [...current, { id: Date.now(), role: 'user', text: value }])
    setAsking(true)
    try {
      if (demo) {
        setMessages(current => [...current, { id: Date.now() + 1, role: 'assistant', text: '你正在使用演示模式，不会发送真实请求或修改数据库。请使用真实账户登录后再试。', example: true }])
      } else if (token && assistantMode === 'agent') {
        const answer = await api.askAgent(token, value)
        setMessages(current => [...current, { id: Date.now() + 1, role: 'assistant', text: answer.answer, model: 'Task Agent', toolEvents: answer.tool_events }])
        // The original Agent only returns the final text, not a tasks_changed flag.
        // Refresh on every successful Agent response so CRUD changes appear immediately.
        try { setTasks(await api.tasks(token)) }
        catch { toast('Agent 已响应，但任务列表刷新失败，请在「我的任务」中手动刷新。', true) }
      } else if (token) {
        const answer: ChatAnswer = await api.askQwen(token, value)
        setMessages(current => [...current, { id: Date.now() + 1, role: 'assistant', text: answer.answer, model: answer.model, source: answer.source_url }])
      }
    } catch (err) {
      setMessages(current => [...current, { id: Date.now() + 1, role: 'assistant', text: `请求失败：${err instanceof Error ? err.message : '未知错误'}` }])
    } finally { setAsking(false) }
  }

  if (!authenticated) return <AuthScreen onAuth={login} onDemo={startDemo} />

  const nav: { id: Page; name: string; icon: ReactNode }[] = [
    { id: 'overview', name: '工作台概览', icon: <LayoutDashboard size={19} /> },
    { id: 'tasks', name: '我的任务', icon: <ListTodo size={19} /> },
    { id: 'assistant', name: 'AI 智能助手', icon: <Bot size={19} /> },
    { id: 'knowledge', name: '知识库', icon: <BookOpen size={19} /> },
  ]
  const titles: Record<Page, [string, string]> = {
    overview: ['工作台概览', '你的每一步进展，都值得被看见'],
    tasks: ['我的任务', '保持专注，让每一件事都有进展'],
    assistant: ['AI 智能助手', '从一个好问题，开启新的思路'],
    knowledge: ['知识库', '让信息沉淀为可检索的知识'],
    settings: ['账户与设置', '查看当前工作空间的连接状态'],
  }

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand"><Brand /><button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
      <div className="workspace-picker"><span className="workspace-logo">W</span><span><strong>My Workspace</strong><small>Personal space</small></span><ChevronDown size={15} /></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="工作空间导航">
        {nav.map(item => <button className={`nav-item ${page === item.id ? 'active' : ''}`} key={item.id} onClick={() => navigate(item.id)}>{item.icon}<span>{item.name}</span>{item.id === 'tasks' && <b>{tasks.length}</b>}</button>)}
      </nav>
      <div className="sidebar-section-label sidebar-label-second">GENERAL</div>
      <nav className="nav-list"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19} /><span>账户与设置</span></button>
        <a className="nav-item" href="https://github.com/EighthhDayy/ai-task-manager" rel="noreferrer" target="_blank"><Github size={19} /><span>GitHub Repository</span><ArrowUpRight size={15} /></a></nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-promo"><div className="sidebar-promo-graphic"><Sparkles size={23} /></div><div className="promo-title">Ideas into action.</div><p>将想法转化为真正完成的每一项任务。</p><button onClick={() => navigate('assistant')}>探索 AI 助手 <ArrowRight size={14} /></button></div>
      <div className="sidebar-user"><div className="avatar">{currentUser?.username?.slice(0, 1).toUpperCase() || 'U'}</div><div><strong>{currentUser?.username || '加载中…'}</strong><small>{demo ? '演示模式' : 'Personal Account'}</small></div><button title="退出登录" aria-label="退出登录" onClick={logout}><LogOut size={18} /></button></div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button><span className="breadcrumb-home">Workspace</span><ChevronRight size={15} /><strong>{titles[page][0]}</strong></div>
        <div className="topbar-right">{demo && <span className="demo-pill"><span /> 演示模式 · 示例数据</span>}<span className="topbar-date">{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())}</span><div className="topbar-avatar">{currentUser?.username?.slice(0, 1).toUpperCase() || 'U'}</div></div>
      </header>
      <main className="content">
        <div className="page-heading"><div><div className="page-eyebrow"><span className="eyebrow-line" /> YOUR WORKSPACE</div><h1>{titles[page][0]}<span className="heading-spark">✳</span></h1><p>{titles[page][1]}</p></div><div className="page-heading-actions">{page === 'tasks' || page === 'overview' ? <Button className="primary-button" onClick={() => setEditor('new')}><Plus size={18} /> 新建任务</Button> : null}</div></div>

        {page === 'overview' && <>
          <section className="welcome-banner"><div className="banner-copy"><span className="banner-kicker"><Sparkles size={14} /> INTELLIGENT PRODUCTIVITY</span><h2>把复杂交给系统，<br /><span>把专注留给自己。</span></h2><p>今天也在不断前进。管理任务、探索知识，与 AI 一起完成更多。</p><button onClick={() => navigate('assistant')}>与 AI 开始对话 <ArrowRight size={16} /></button></div><div className="banner-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-center"><Sparkles size={44} strokeWidth={1.6} /></div><div className="art-float art-float-one"><CheckCircle2 size={19} /></div><div className="art-float art-float-two"><Zap size={20} /></div><div className="art-float art-float-three"><MessageCircle size={18} /></div></div></section>
          <section className="metrics-grid">
            <MetricCard label="全部任务" value={tasks.length} note="当前工作空间任务数" icon={<ListTodo size={20} />} tint="lavender" />
            <MetricCard label="进行中" value={active} note="还在等待你完成" icon={<Clock3 size={20} />} tint="peach" />
            <MetricCard label="已完成" value={completed} note="每一次完成都很重要" icon={<CheckCircle2 size={20} />} tint="mint" />
            <MetricCard label="完成进度" value={`${percentage}%`} note="基于当前任务计算" icon={<Activity size={20} />} tint="blue" detail={<ArrowDownRight size={17} />} />
          </section>
          <div className="overview-columns">
            <section className="panel tasks-panel"><div className="panel-header"><div><h3>最近的任务</h3><p>查看并管理你的待办事项</p></div><button className="text-link" onClick={() => navigate('tasks')}>查看全部 <ArrowRight size={15} /></button></div>
              {loading && !tasks.length ? <div className="panel-loading"><LoaderCircle className="spin" /> 正在加载…</div> : tasks.length ? <div className="task-list">{[...tasks].sort((a, b) => Number(a.completed) - Number(b.completed)).slice(0, 5).map(t => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={toggleTask} onEdit={setEditor} onDelete={setDeleting} />)}</div> : <EmptyState icon={<ListTodo size={28} />} title="这里还没有任务" description="创建第一项任务，让今天有个好开始。" action={<button className="secondary-button" onClick={() => setEditor('new')}>创建任务</button>} />}
            </section>
            <div className="overview-right">
              <section className="panel progress-panel"><div className="panel-header"><div><h3>任务完成情况</h3><p>为每一点进步喝彩</p></div><MoreHorizontal size={19} color="#a4a7b6" /></div><div className="progress-visual"><div className="progress-donut" style={{ background: `conic-gradient(#7366f6 ${percentage}%, #eeecfa 0)` }}><div><strong>{percentage}%</strong><span>已完成</span></div></div></div><div className="progress-legend"><span><i className="legend-done"/>已完成 <b>{completed}</b></span><span><i className="legend-active"/>进行中 <b>{active}</b></span></div></section>
              <section className="ai-shortcut"><div className="ai-shortcut-top"><div className="ai-shortcut-icon"><Bot size={23} /></div><span>AI POWERED <Sparkles size={13}/></span></div><h3>有想法？问问 AI。</h3><p>借助 Qwen3 探索问题，从知识中寻找答案。</p><button onClick={() => navigate('assistant')}>打开智能助手 <ArrowRight size={16} /></button></section>
            </div>
          </div>
          <section className="quick-links"><div className="quick-link" onClick={() => navigate('tasks')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') navigate('tasks') }}><div className="quick-link-icon lilac"><ListTodo size={20} /></div><div><strong>任务管理</strong><span>规划和追踪每项工作</span></div><ArrowUpRight size={17} /></div><div className="quick-link" onClick={() => navigate('knowledge')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') navigate('knowledge') }}><div className="quick-link-icon sky"><Database size={20} /></div><div><strong>知识库</strong><span>文档知识的统一入口</span></div><ArrowUpRight size={17} /></div><div className="quick-link" onClick={() => navigate('settings')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') navigate('settings') }}><div className="quick-link-icon mint"><ShieldCheck size={20} /></div><div><strong>系统状态</strong><span>了解可用的 API 功能</span></div><ArrowUpRight size={17} /></div></section>
        </>}

        {page === 'tasks' && <section className="panel task-manager"><div className="panel-header manager-head"><div><h3>任务列表 <span className="count-badge">{tasks.length}</span></h3><p>更新状态，保持每一天的进度</p></div><button className="icon-button refresh-button" onClick={refresh} disabled={loading} title="刷新任务"><Activity size={18} className={loading ? 'spin' : ''} /></button></div>
          <div className="toolbar"><div className="filter-group"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>全部 <span>{tasks.length}</span></button><button className={filter === 'active' ? 'selected' : ''} onClick={() => setFilter('active')}>进行中 <span>{active}</span></button><button className={filter === 'done' ? 'selected' : ''} onClick={() => setFilter('done')}>已完成 <span>{completed}</span></button></div><label className="searchbox"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索任务…" /></label></div>
          {loading && !tasks.length ? <div className="panel-loading"><LoaderCircle className="spin" /> 正在获取任务…</div> : filtered.length ? <div className="task-list manager-list">{filtered.map(t => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={toggleTask} onEdit={setEditor} onDelete={setDeleting} />)}</div> : <EmptyState icon={<FolderOpen size={29} />} title={search || filter !== 'all' ? '没有找到匹配的任务' : '任务列表还是空的'} description="可以调整筛选条件，或创建一项新任务。" action={<button className="secondary-button" onClick={() => { setSearch(''); setFilter('all'); setEditor('new') }}>创建新任务</button>} />}
          <div className="manager-footer"><span>共 {filtered.length} 项{demo ? ' · 演示模式变更不会保存' : ' · 与 FastAPI 同步'}</span><div> <ChevronLeft size={16} /> 1 / 1 <ChevronRight size={16} /> </div></div>
        </section>}

        {page === 'assistant' && <div className="assistant-layout"><section className="panel chat-panel"><div className="chat-header"><div className="chat-model-icon"><Sparkles size={22}/></div><div><h3>{assistantMode === 'agent' ? 'Agent 智能任务管理' : 'Qwen3 智能问答'}</h3><p><StatusDot online={!demo} /> {demo ? '演示模式，不发送真实请求' : assistantMode === 'agent' ? 'API 路由：/ai/agent（使用现有 llm.py）' : 'API 路由：/ai/Qwen3-qa'}</p></div><span className="chat-model-tag">{assistantMode === 'agent' ? 'Task Agent' : 'Qwen3'}</span></div>
          <div className="assistant-mode-switch" role="group" aria-label="选择智能助手模式"><button type="button" className={assistantMode === 'qwen' ? 'selected' : ''} disabled={asking} onClick={() => switchAssistantMode('qwen')}><BookOpen size={15}/> Qwen3 知识问答</button><button type="button" className={assistantMode === 'agent' ? 'selected' : ''} disabled={asking} onClick={() => switchAssistantMode('agent')}><ListTodo size={15}/> Agent 任务操作</button></div>
          <div className="chat-messages">
            {!messages.length ? <div className="chat-welcome"><div className="chat-welcome-icon"><WandSparkles size={36}/></div><span className="chat-kicker">HOW CAN I HELP YOU?</span><h2>{assistantMode === 'agent' ? '把想法变成行动。' : '今天有什么想探索的？'}</h2><p>{assistantMode === 'agent' ? '用自然语言查询、创建、完成你自己的任务。所有写入操作都通过 FastAPI 鉴权和校验。' : '提出一个问题，Qwen3 将通过检索与推理服务进行回答。'}</p><div className="suggested-prompts">{(assistantMode === 'agent' ? agentExamples : qaExamples).map(x => <button key={x} onClick={() => void sendQuestion(x)}><Sparkles size={15} />{x}<ArrowUpRight size={14} /></button>)}</div></div> : <div className="chat-thread">{messages.map(msg => <div key={msg.id} className={`message ${msg.role}`}><div className="message-avatar">{msg.role === 'assistant' ? <Bot size={19} /> : (currentUser?.username?.slice(0, 1).toUpperCase() || 'U')}</div><div className="message-content"><div className="message-label">{msg.role === 'assistant' ? (msg.example ? '演示说明' : (msg.model || 'AI Assistant')) : 'You'}</div><div className="message-bubble">{msg.text}</div>{msg.toolEvents && msg.toolEvents.length > 0 && <div className="tool-event-list" aria-label="Agent 真实工具执行记录">
  {msg.toolEvents.map((event, index) => <details className="tool-event" key={`${msg.id}-${index}`}>
    <summary><span className="tool-event-name">{event.name}</span><span className="tool-event-status">{event.status === 'success' ? '成功' : event.status === 'error' ? '失败' : '执行记录'}</span></summary>
    {event.arguments && <div className="tool-event-section"><strong>调用参数</strong><pre>{JSON.stringify(event.arguments, null, 2)}</pre></div>}
    {'result' in event && <div className="tool-event-section"><strong>返回结果</strong><pre>{JSON.stringify(event.result, null, 2)}</pre></div>}
  </details>)}
</div>}{msg.source && safeWebUrl(msg.source) && <a className="source-link" href={safeWebUrl(msg.source)!} target="_blank" rel="noopener noreferrer"><BookOpen size={14} /> 查看检索来源 <ArrowUpRight size={13} /></a>}</div></div>)}{asking && <div className="message assistant"><div className="message-avatar"><Bot size={19}/></div><div className="message-content"><div className="message-label">AI Assistant</div><div className="typing"><span/><span/><span/></div></div></div>}<div ref={messageEnd} /></div>}
          </div>
          <form className="chat-composer" onSubmit={e => { e.preventDefault(); void sendQuestion() }}><div className="composer-box"><textarea rows={2} value={question} maxLength={400} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendQuestion() } }} placeholder={assistantMode === 'agent' ? '例如：帮我创建一个任务，明天测试 RAG 接口…' : '向 Qwen3 提问…（Enter 发送，Shift+Enter 换行）'} /><div className="composer-footer"><span><ShieldCheck size={14}/>{assistantMode === 'agent' ? 'Agent 可以修改当前账户的任务；请核对指令' : '知识问答模式不会执行任务操作'}</span><button aria-label="发送问题" type="submit" disabled={!question.trim() || asking}>{asking ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button></div></div><p>{assistantMode === 'agent' ? 'Agent 的工具操作会写入数据库，目前不支持自动撤销。' : 'AI 生成的回答可能存在错误，请核对来源。'}{demo ? ' 当前处于演示模式。' : ''}</p></form>
        </section><aside className="assistant-side"><section className="panel assistant-info"><div className="side-section-heading"><span className="assistant-side-icon"><Bot size={19}/></span><strong>关于这个助手</strong></div><p>{assistantMode === 'agent' ? '通过 Function Calling 选择受限任务工具，后端对每一步都执行 JWT 用户隔离和参数校验。' : '连接微调后的 Qwen3 问答接口，并显示答案来源。'}</p><div className="model-row"><span>当前接口</span><code>{assistantMode === 'agent' ? '/ai/agent' : '/ai/Qwen3-qa'}</code></div><div className="model-row"><span>鉴权方式</span><strong>JWT Bearer</strong></div><div className="model-row"><span>任务工具执行</span><strong>{assistantMode === 'agent' ? '查询 / 创建 / 完成' : '无'}</strong></div></section><section className="integration-note"><div className="note-icon"><Zap size={18}/></div><h4>{assistantMode === 'agent' ? '真实工具调用' : '知识问答模式'}</h4><p>{assistantMode === 'agent' ? 'Agent 模式复用后端原有 /ai/agent 和 llm.py；当前接口只返回最终文本，不会虚构工具执行记录。Agent 请求完成后自动刷新任务列表。' : 'Qwen3 只负责有来源的问答。切换到 Agent 模式才会查询或修改任务。'}</p></section></aside></div>}

        {page === 'knowledge' && <div className="knowledge-layout"><section className="panel knowledge-main"><div className="panel-header"><div><h3>我的知识库</h3><p>集中管理文档，支持后续检索增强问答</p></div><span className="soft-tag"><Database size={14}/> 待接入 API</span></div><div className="upload-dropzone"><div className="upload-icon"><CloudUpload size={34} /></div><h3>让知识触手可及</h3><p>文档上传和 RAG 检索页面已准备好。<br />当前仓库 main 分支尚未提供上传与检索接口。</p><button className="secondary-button" disabled><CloudUpload size={16}/> 上传 PDF（待接口接入）</button><span>不会发送文件，也不会虚构索引结果</span></div><div className="knowledge-empty"><FileText size={20}/><div><strong>暂无可展示的文档</strong><p>接通文档列表与上传 API 后，将在这里展示真实文件及索引状态。</p></div></div></section><aside className="knowledge-side"><section className="panel how-it-works"><h3>知识处理流程</h3><div className="flow-step"><span>01</span><div><strong>文档上传</strong><p>导入 PDF 等知识资料</p></div></div><div className="flow-step"><span>02</span><div><strong>解析与向量化</strong><p>分块、Embedding 与 pgvector</p></div></div><div className="flow-step"><span>03</span><div><strong>检索与问答</strong><p>提供可追溯的答案来源</p></div></div></section><section className="integration-note"><div className="note-icon"><HelpCircle size={18}/></div><h4>需要连接后端接口</h4><p>你可以先查看 FastAPI Swagger，确认文档上传、任务状态和检索接口可用后再接入。</p><a href={apiUrl('/docs')} target="_blank" rel="noreferrer">查看 API 文档 <ArrowUpRight size={14}/></a></section></aside></div>}

        {page === 'settings' && <div className="settings-grid"><section className="panel settings-card"><h3>个人账户</h3><p>当前登录工作空间</p><div className="account-line"><div className="account-avatar">{currentUser?.username?.slice(0,1).toUpperCase() || 'U'}</div><div><strong>{currentUser?.username || '加载中'}</strong><span>{demo ? 'Demo account · 示例数据' : `User ID #${currentUser?.id ?? '—'}`}</span></div></div><button className="secondary-button" onClick={logout}><LogOut size={16}/> {demo ? '退出演示模式' : '退出登录'}</button></section><section className="panel settings-card"><h3>后端接口连接</h3><p>根据当前 main 分支的已知路由</p><div className="connection-list"><div><span><CheckCircle2 size={17}/> JWT 用户鉴权</span><strong>已接入</strong></div><div><span><CheckCircle2 size={17}/> 任务 CRUD</span><strong>已接入</strong></div><div><span><CheckCircle2 size={17}/> Qwen3 问答</span><strong>已对接*</strong></div><div><span><Circle size={17}/> 文档 RAG API</span><em>待接入</em></div><div><span><CheckCircle2 size={17}/> Agent 对话 API</span><strong>已对接*</strong></div></div><p className="settings-disclaimer">* Qwen3 需要 TRANSFORMER_QA_URL；Agent 需要后端现有 LLM 配置。状态仅代表已编写接口调用，不等于运行健康检查。</p></section><section className="panel settings-card full-width"><h3>开发环境</h3><div className="developer-info"><div><span>前端技术</span><strong>React · TypeScript · Vite</strong></div><div><span>API 基础地址</span><code>{apiUrl('')}</code></div><div><span>运行模式</span><strong>{demo ? '前端演示模式' : '已登录账户'}</strong></div></div><p>本地运行通过 Vite 代理解决跨域；独立部署请配置 VITE_API_BASE_URL 或反向代理。</p></section></div>}
      </main>
      <footer className="main-footer"><span>© 2026 taskflow.ai</span><span>Built with care <span className="footer-spark">✳</span> React + FastAPI</span></footer>
    </div>

    {editor && <TaskEditor key={editor === 'new' ? 'new' : editor.id} task={editor === 'new' ? null : editor} busy={saving} onClose={() => setEditor(null)} onSave={saveTask} />}
    {deleting && <Modal title="删除任务" subtitle="此操作无法撤销，请确认。" onClose={() => setDeleting(null)}><div className="delete-dialog"><div className="delete-symbol"><Trash2 size={24}/></div><p>确定删除 <strong>{deleting.title}</strong> 吗？</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleting(null)}>取消</button><button className="delete-button" disabled={saving} onClick={() => void removeTask()}>{saving && <LoaderCircle className="spin" size={16}/>}确认删除</button></div></div></Modal>}
    {notice && <div role="status" className={`toast ${notice.error ? 'error' : ''}`}><span>{notice.error ? <X size={17}/> : <Check size={17}/>}</span>{notice.message}<button aria-label="关闭提示" onClick={() => setNotice(null)}><X size={15}/></button></div>}
  </div>
}
