'use client'

import { useState, useEffect } from 'react'
import { searchDocuments, loadDocument, clearDocuments, getDocumentCount } from '@/lib/knowledge-base'
export default function KnowledgePage() {
  const [text, setText] = useState('')
  const [count, setCount] = useState(0)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => {
    setCount(getDocumentCount())
  }, [])

  const handleLoad = () => {
    const n = loadDocument(text)
    setCount(n)
    setText('')
    alert(`已导入 ${n} 个段落`)
  }

  const handleSearch = () => {
    const r = searchDocuments(query)
    setResult(r || '未找到相关内容')
  }

  const handleClear = () => {
    clearDocuments()
    setCount(0)
    setResult('')
    alert('已清空知识库')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📚 知识库管理</h1>
        
        <div className="mb-4 text-sm text-gray-500">
          当前知识库：{count} 个段落
        </div>

        {/* 导入文本 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">导入文本</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴要导入的知识文本..."
            rows={6}
            className="w-full border rounded-lg p-3 dark:bg-gray-800 dark:text-white"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={handleLoad} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              覆盖导入
            </button>
            <button onClick={handleClear} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              清空
            </button>
          </div>
        </div>

        {/* 检索测试 */}
        <div>
          <h2 className="text-lg font-semibold mb-2">检索测试</h2>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入查询关键词..."
              className="flex-1 border rounded-lg px-3 py-2 dark:bg-gray-800 dark:text-white"
            />
            <button onClick={handleSearch} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              检索
            </button>
          </div>
          {result && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 border rounded-lg whitespace-pre-wrap text-sm">
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}