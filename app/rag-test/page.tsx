'use client'

import { useState } from 'react'

export default function RagTestPage() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadDocument = async () => {
    if (!file) {
      setStatus('请先选择文件')
      return
    }

    setStatus('上传中...')
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/rag', {
      method: 'POST',
      body: formData
    })
    const data = await res.json()
    setStatus(data.message)
  }

  const search = async () => {
    if (!query.trim() || loading) return
    setLoading(true)
    setAnswer('')
    setSources([])

    const res = await fetch('/api/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'query', query })
    })
    const data = await res.json()
    
    if (data.success) {
      setAnswer(data.answer)
      setSources(data.sources)
    } else {
      setAnswer(data.message)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">RAG 知识库问答</h1>
      
      {/* 文件上传区 */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 text-center">
        <input
          type="file"
          accept=".txt,.pdf,.docx"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="mb-2"
        />
        {file && <p className="text-sm text-gray-600">已选择：{file.name}</p>}
        <button 
          className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          onClick={loadDocument}
        >
          上传并加载
        </button>
      </div>
      <p className="text-green-600 mb-4">{status}</p>

      {/* 提问区 */}
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="输入问题..."
          disabled={loading}
        />
        <button 
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          onClick={search}
          disabled={loading || !query.trim()}
        >
          {loading ? '思考中...' : '提问'}
        </button>
      </div>

      {/* 回答 */}
      {answer && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h2 className="font-bold mb-2">回答：</h2>
          <p className="whitespace-pre-wrap">{answer}</p>
        </div>
      )}

      {/* 参考来源 */}
      {sources.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="font-bold text-sm mb-2">📄 参考来源：</h2>
          {sources.map((source, i) => (
            <div key={i} className="text-xs text-gray-600 mb-1">
              <span className="text-yellow-600">[相关度 {source.score}]</span> {source.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}