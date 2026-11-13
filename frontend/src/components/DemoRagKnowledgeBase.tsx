import { useState, type FormEvent } from 'react'
import { BookOpen, CheckCircle2, CloudUpload, FileText, Send } from 'lucide-react'
import './RagKnowledgeBase.css'
import './DemoRagKnowledgeBase.css'

const chunks = [
  {
    id: 'aurora-001',
    text: 'Project Aurora is an internal AI research initiative launched on March 15, 2025. The project leader is Emily Carter.',
  },
  {
    id: 'aurora-002',
    text: 'Its primary goal is to develop a document retrieval system using vector embeddings and PostgreSQL.',
  },
  {
    id: 'aurora-003',
    text: 'The system processes uploaded documents asynchronously using Redis and RQ. The first prototype was completed on June 20, 2025.',
  },
]

const examples = [
  'Who is the leader of Project Aurora?',
  'When was the first prototype completed?',
  'What is the goal of Project Aurora?',

]

type Result = {
  answer: string
  source?: typeof chunks[number]
}

function demoAnswer(question: string): Result {
  const q = question.toLowerCase()

  if (/leader|leads|负责人|领导/.test(q)) {
    return { answer: 'Emily Carter.', source: chunks[0] }
  }

  if (/prototype|原型|完成时间/.test(q)) {
    return { answer: 'June 20, 2025.', source: chunks[2] }
  }

  if (/goal|purpose|目标|目的/.test(q)) {
    return {
      answer: 'The goal is to develop a document retrieval system using vector embeddings and PostgreSQL.',
      source: chunks[1],
    }
  }

  if (/redis|rq|asynchronous|异步/.test(q)) {
    return {
      answer: 'The system processes uploaded documents asynchronously using Redis and RQ.',
      source: chunks[2],
    }
  }

  return { answer: 'No answer in the provided context.' }
}

export default function DemoRagKnowledgeBase() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadedName, setUploadedName] = useState('')
  const [indexed, setIndexed] = useState(false)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [asked, setAsked] = useState('')

  function loadSample() {
    setIndexed(true)
    setUploadedName('')
    setFile(null)
    setQuestion('')
    setResult(null)
    setAsked('')
  }

  function simulateUpload() {
    if (!file) return
    setUploadedName(file.name)
    setIndexed(false)
    setResult(null)
    setAsked('')
  }

  function ask(event: FormEvent) {
    event.preventDefault()
    const value = question.trim()
    if (!indexed || !value) return
    setAsked(value)
    setResult(demoAnswer(value))
  }

  return (
    <div className="rag-demo">
      <section className="panel rag-demo-card">
        <h3><BookOpen size={19} /> RAG Interactive Demo</h3>
        <p>
          离线演示：展示文档索引、检索问答和来源追溯的交互流程。
          不会调用真实 API、Embedding 模型或 PostgreSQL。
        </p>

        <button className="primary-button" type="button" onClick={loadSample}>
          <FileText size={16} /> 加载 Project Aurora 示例文档
        </button>

        {indexed && (
          <div className="rag-job" role="status" style={{ marginTop: 16 }}>
            <strong><CheckCircle2 size={16} /> 模拟索引已完成</strong>
            <p>文档：Project Aurora · 内置示例资料</p>
            <p>文本块数量：{chunks.length}</p>
            <p>索引方式：模拟向量索引（未实际生成 Embedding）</p>
          </div>
        )}
      </section>

      <section className="panel rag-demo-card">
        <h3><CloudUpload size={19} /> PDF 上传流程演示</h3>
        <p>可以选择 PDF 展示上传交互，但不会读取或上传文件内容。</p>

        <input
          type="file"
          accept=".pdf,application/pdf"
          aria-label="选择 PDF 演示文件"
          onChange={event => {
            setFile(event.target.files?.[0] ?? null)
            setUploadedName('')
          }}
        />

        <button
          className="secondary-button"
          type="button"
          disabled={!file}
          onClick={simulateUpload}
          style={{ marginTop: 12 }}
        >
          <CloudUpload size={15} /> 模拟上传
        </button>

        {uploadedName && (
          <p role="status" style={{ marginTop: 12 }}>
            已模拟选择并上传：{uploadedName}。
            未解析 PDF 或建立真实索引。请使用上方内置示例体验问答。
          </p>
        )}
      </section>

      <section className="panel rag-demo-card">
        <h3><BookOpen size={19} /> 向示例知识库提问</h3>
        <p>问答仅使用 Project Aurora 内置示例资料。</p>

        <div className="rag-demo-examples">
          {examples.map(example => (
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

        <form onSubmit={ask} className="rag-ask-form">
          <textarea
            rows={3}
            aria-label="演示知识库问题"
            placeholder="先加载示例文档，再输入问题..."
            value={question}
            onChange={event => setQuestion(event.target.value)}
            disabled={!indexed}
          />
          <div className="rag-ask-actions">
            <span>离线模拟检索</span>
            <button
              className="primary-button"
              type="submit"
              disabled={!indexed || !question.trim()}
            >
              <Send size={15} /> 提问
            </button>
          </div>
        </form>

        {result && (
          <section className="rag-answer" aria-live="polite">
            <h4>示例检索回答</h4>
            <p style={{ fontSize: 12, opacity: 0.7 }}>问题：{asked}</p>
            <div className="rag-answer-text">{result.answer}</div>

            <div className="rag-evidence">
              <strong>模拟检索来源</strong>
              {result.source ? (
                <div>
                  <p>Project Aurora · Chunk ID: {result.source.id}</p>
                  <blockquote>{result.source.text}</blockquote>
                </div>
              ) : (
                <p>未找到可支持该回答的示例证据，因此拒答。</p>
              )}
            </div>
          </section>
        )}
      </section>
    </div>
  )
}
