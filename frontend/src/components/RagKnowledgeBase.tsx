import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, BookOpen, CheckCircle2, CloudUpload, Database, FileText, LoaderCircle, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { api, type DocumentJobStatus, type IndexedDocument, type RagAnswer } from '../lib/api'
import './RagKnowledgeBase.css'

type Props = { token: string; demo: boolean }
type UploadRecord = { filename: string; sourceId: string; jobId: string }

const MAX_SIZE = 5 * 1024 * 1024
const TERMINAL = new Set(['finished', 'failed', 'stopped', 'canceled'])
const INDEX_DATE = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

function statusLabel(raw: string): string {
  switch (raw.toLowerCase()) {
    case 'queued': return '排队中'
    case 'started': return '正在处理'
    case 'deferred': return '等待依赖任务'
    case 'scheduled': return '等待调度'
    case 'finished': return '索引完成'
    case 'failed': return '处理失败'
    case 'stopped': return '已停止'
    case 'canceled': return '已取消'
    default: return '状态待确认'
  }
}

function indexSummary(value: unknown): { sourceId?: string; chunks?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const obj = value as Record<string, unknown>
  return {
    ...(typeof obj.source_id === 'string' ? { sourceId: obj.source_id } : {}),
    ...(typeof obj.chunk_count === 'number' ? { chunks: obj.chunk_count } : {}),
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请重试。'
}

export default function RagKnowledgeBase({ token, demo }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [upload, setUpload] = useState<UploadRecord | null>(null)
  const [job, setJob] = useState<DocumentJobStatus | null>(null)
  const [jobError, setJobError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [answerError, setAnswerError] = useState('')
  const [documents, setDocuments] = useState<IndexedDocument[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState('')
  const [documentsRevision, setDocumentsRevision] = useState(0)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!token || demo) return
    let active = true

    async function loadDocuments() {
      setDocumentsLoading(true)
      setDocumentsError('')
      try {
        const indexedDocuments = await api.listDocuments(token)
        if (active) setDocuments(indexedDocuments)
      } catch (error) {
        if (active) setDocumentsError(`文档列表加载失败：${errorText(error)}`)
      } finally {
        if (active) setDocumentsLoading(false)
      }
    }

    void loadDocuments()
    return () => { active = false }
  }, [token, demo, documentsRevision])

  // Poll only for an actual backend job. Clear the timer on logout, navigation or a new upload.
  useEffect(() => {
    if (!token || demo || !upload?.jobId) return
    const jobId = upload.jobId
    let active = true
    let checks = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const latest = await api.getDocumentJob(token, jobId)
        if (!active) return
        setJob(latest)
        setJobError('')
        const state = latest.status.toLowerCase()
        if (TERMINAL.has(state)) {
          if (state === 'finished') setDocumentsRevision(value => value + 1)
          else setJobError('文档任务未完成。请尝试重新上传。')
          return
        }
        checks += 1
        if (checks >= 200) {
          setJobError('已查询约 10 分钟，仍未获得最终状态。你可以点击「重新查询状态」。')
          return
        }
        timer = setTimeout(() => { void poll() }, 3000)
      } catch (error) {
        if (active) setJobError(`任务状态查询失败：${errorText(error)}`)
      }
    }

    void poll()
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [upload?.jobId, token, demo, retryKey])

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (demo || !token || !file || uploading) return
    setJobError('')
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setJobError('只支持 PDF 文件。')
      return
    }
    if (file.size > MAX_SIZE) {
      setJobError('PDF 文件不能超过 5 MB。')
      return
    }
    if (file.size === 0) {
      setJobError('文件为空，请选择有效 PDF。')
      return
    }
    setUploading(true)
    try {
      // Stable for this submitted job, unique across independent uploads.
      const filename = file.name.replace(/\.pdf$/i, '')
      const sourceId = `${filename.slice(0, 60) || 'document'}-${crypto.randomUUID().slice(0, 8)}`
      const created = await api.uploadPdfAsync(token, file, sourceId)
      setJob({ job_id: created.job_id, status: created.status, result: null })
      setUpload({ filename: file.name, sourceId, jobId: created.job_id })
      setFile(null)
      const input = document.getElementById('rag-file-input') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (error) {
      setJobError(`上传失败：${errorText(error)}`)
    } finally {
      setUploading(false)
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = question.trim()
    if (!value || asking || demo || !token) return
    setAsking(true)
    setAnswer(null)
    setAnswerError('')
    try {
      setAnswer(await api.askDocs(token, value))
    } catch (error) {
      setAnswerError(`知识库问答失败：${errorText(error)}`)
    } finally {
      setAsking(false)
    }
  }

  async function removeDocument(item: IndexedDocument) {
    if (demo || !token || deletingId !== null) return
    const name = item.filename ?? item.source_id
    if (!window.confirm(`删除「${name}」及其索引？删除后，知识库将无法再检索这份文档。`)) return
    setDeletingId(item.id)
    setDeleteError('')
    try {
      await api.deleteDocument(token, item.id)
      setDocuments(current => current.filter(doc => doc.id !== item.id))
      setDocumentsRevision(value => value + 1)
    } catch (error) {
      setDeleteError(`删除失败：${errorText(error)}`)
    } finally {
      setDeletingId(null)
    }
  }

  const state = (job?.status || '').toLowerCase()
  const complete = state === 'finished'
  const pending = Boolean(upload) && !TERMINAL.has(state) && !jobError
  const indexed = indexSummary(job?.result)
  const sources = answer?.sources ?? []

  return (
    <div className="knowledge-layout rag-layout">
      <section className="panel knowledge-main rag-main">
        <div className="panel-header">
          <div><h3>我的知识库</h3><p>上传 PDF，异步建立向量索引，再根据已索引的文档提问</p></div>
          <span className="soft-tag"><Database size={14} /> 文档问答</span>
        </div>

        <form className="rag-upload" onSubmit={e => { void submitUpload(e) }}>
          <label htmlFor="rag-file-input" className="rag-upload-picker">
            <CloudUpload size={28} />
            <strong>{file ? file.name : '选择 PDF 文档'}</strong>
            <span>仅支持 PDF · 最大 5 MB · 上传后自动处理</span>
          </label>
          <input id="rag-file-input" className="rag-file-input" aria-label="选择 PDF 文档" type="file" accept=".pdf,application/pdf" disabled={demo || uploading} onChange={e => setFile(e.target.files?.[0] || null)} />
          <button className="primary-button" disabled={demo || uploading || !file || !token} type="submit">
            {uploading ? <LoaderCircle size={16} className="spin" /> : <CloudUpload size={16} />}
            {uploading ? '提交中…' : '上传并建立索引'}
          </button>
        </form>

        {demo && <p className="rag-notice">请登录账户后上传文档和使用知识库问答。</p>}
        {jobError && <p className="rag-error" role="alert"><AlertCircle size={16} /> {jobError}</p>}

        {upload && <section className="rag-job" aria-live="polite">
          <div className="rag-job-top"><span><FileText size={17} /> {upload.filename}</span><strong className={complete ? 'rag-done' : state === 'failed' ? 'rag-failed' : ''}>{pending && <LoaderCircle size={14} className="spin" />}{statusLabel(job?.status || 'QUEUED')}</strong></div>
          <p>来源编号：<code>{upload.sourceId}</code></p>
          <p>处理任务编号：<code>{upload.jobId}</code></p>
          {complete && <p className="rag-success"><CheckCircle2 size={15} /> 向量索引已完成{typeof indexed.chunks === 'number' ? ` · ${indexed.chunks} 个文本块` : ''}</p>}
          {jobError && <button className="secondary-button rag-retry" type="button" onClick={() => { setJobError(''); setRetryKey(v => v + 1) }}><RefreshCw size={14} /> 重新查询状态</button>}
        </section>}

        {!demo && token && <section className="rag-documents" aria-labelledby="rag-documents-title">
          <div className="rag-documents-header">
            <div><h3 id="rag-documents-title">已索引文档</h3><p>索引完成后会出现在这里。</p></div>
            <button className="secondary-button" type="button" disabled={documentsLoading || deletingId !== null} onClick={() => setDocumentsRevision(value => value + 1)}>
              <RefreshCw size={14} className={documentsLoading ? 'spin' : undefined} /> 刷新
            </button>
          </div>
          {documentsError && <p className="rag-error" role="alert"><AlertCircle size={16} /> {documentsError}</p>}
          {deleteError && <p className="rag-error" role="alert"><AlertCircle size={16} /> {deleteError}</p>}
          {documentsLoading && <p className="rag-documents-empty" role="status">正在加载文档…</p>}
          {!documentsLoading && !documentsError && !documents.length && <p className="rag-documents-empty">暂无已索引的文档。</p>}
          {documents.length > 0 && <ul className="rag-document-list">
            {documents.map(item => {
              const name = item.filename ?? item.source_id
              return <li className="rag-document" key={item.id}>
                <FileText size={18} aria-hidden="true" />
                <div className="rag-document-info">
                  <strong>{name}</strong>
                  <small>{item.chunk_count} 个文本块{item.indexed_at && ` · ${INDEX_DATE.format(new Date(item.indexed_at))}`}</small>
                </div>
                <button className="secondary-button rag-delete" type="button" aria-label={`删除 ${name}`} disabled={deletingId !== null} onClick={() => { void removeDocument(item) }}>
                  {deletingId === item.id ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                  {deletingId === item.id ? '删除中…' : '删除'}
                </button>
              </li>
            })}
          </ul>}
        </section>}

        <div className="rag-divider" />

        <div className="rag-ask-head"><BookOpen size={19} /><div><h3>向知识库提问</h3><p>仅基于当前账户可检索的文档片段回答</p></div></div>
        <form className="rag-ask-form" onSubmit={e => { void submitQuestion(e) }}>
          <textarea aria-label="知识库问题" rows={3} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} disabled={demo || asking} />
          <div className="rag-ask-actions"><span>根据文档内容回答</span><button className="primary-button" type="submit" disabled={demo || !token || !question.trim() || asking}>{asking ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}{asking ? '检索中…' : '提问'}</button></div>
        </form>
        {answerError && <p className="rag-error" role="alert"><AlertCircle size={16} /> {answerError}</p>}
        {answer && <section className="rag-answer" aria-live="polite">
          <h4>检索回答</h4>
          <div className="rag-answer-text">{answer.answer}</div>
          <div className="rag-evidence">
            <strong>检索来源</strong>
            {sources.length > 0 ? <ul className="rag-source-list">
              {sources.map(source => <li className="rag-source" key={source.chunk_id}>
                <div className="rag-source-header">
                  <strong>{source.filename ?? source.source_id}</strong>
                  {source.page_number !== null && <span>PDF 第 {source.page_number} 页</span>}
                </div>
                <blockquote>{source.text}</blockquote>
              </li>)}
            </ul> : answer.retrieved_chunk_ids.length > 0 ? (
              <div className="rag-chunks">{answer.retrieved_chunk_ids.map(id => <code key={id}>{id}</code>)}</div>
            ) : <p>没有找到符合条件的文档片段。</p>}
          </div>
        </section>}
      </section>

      <aside className="knowledge-side rag-side">
        <section className="panel how-it-works">
          <h3>知识处理流程</h3>
          <div className="flow-step"><span>01</span><div><strong>文档上传</strong><p>登录验证 · 格式检查 · 最大 5 MB</p></div></div>
          <div className="flow-step"><span>02</span><div><strong>建立索引</strong><p>文档解析 · 文本分块 · 向量索引</p></div></div>
          <div className="flow-step"><span>03</span><div><strong>知识库问答</strong><p>显示检索来源和文档片段</p></div></div>
        </section>
        <section className="integration-note">
          <div className="note-icon"><ShieldCheck size={18} /></div>
          <h4>账户级知识隔离</h4>
          <p>问答只检索当前账户有权访问的文档。</p>
          <p>你可以查看和删除自己已索引的文档。</p>
        </section>
      </aside>
    </div>
  )
}
