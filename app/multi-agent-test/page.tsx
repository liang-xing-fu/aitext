'use client'

import { useState } from 'react'

export default function MultiAgentTestPage() {
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const sessionId = 'multi-agent-test-' + Math.random().toString(36).substring(7)

  const handleSubmit = async () => {
    if (!input.trim()) return
    setLoading(true)
    setResponse('')

    try {
      const res = await fetch('/api/multi-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: input })
      })
      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setResponse(`错误：${e.message}`)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
          🤖 多 Agent 协作测试
        </h1>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="输入问题，例如：我们知识库里有没有提到退款规则？另外帮我算一下 199 × 3 再加 50 是多少"
            className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-800 dark:text-white"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '发送'}
          </button>
        </div>

        {response && (
          <pre className="bg-black/90 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap">
            {response}
          </pre>
        )}
      </div>
    </div>
  )
}