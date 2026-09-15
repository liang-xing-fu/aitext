'use client'
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AgentPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const sessionIdRef = useRef(Math.random().toString(36).substring(7))
  const bottomRef = useRef<HTMLDivElement>(null)

  // 第一步：初始化时从 localStorage 读取
  useEffect(() => {
    const saved = localStorage.getItem('agent_messages')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      } catch {}
    }
    setInitialized(true)
  }, [])

  // 第二步：每次 messages 变化时保存（只在初始化完成后才保存）
  useEffect(() => {
    if (initialized) {
      localStorage.setItem('agent_messages', JSON.stringify(messages))
    }
  }, [messages, initialized])

  // 自动滚动
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')

    // 先添加用户消息和空助手消息
    setMessages(prev => [...prev, 
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' }
    ])
    setLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: userMessage
        })
      })

      if (!res.ok) throw new Error('请求失败')

      const contentType = res.headers.get('content-type') || ''
      
      if (contentType.includes('text/event-stream')) {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const json = JSON.parse(line)
              if (json.content) {
                fullContent += json.content
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: fullContent }
                  return updated
                })
              }
            } catch {}
          }
        }
      } else {
        const data = await res.json()
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { 
            role: 'assistant', 
            content: data.success ? data.message : '❌ ' + data.message 
          }
          return updated
        })
      }
    } catch (e: any) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: '❌ 网络错误' }
        return updated
      })
    }

    setLoading(false)
  }

  const clearHistory = () => {
    setMessages([])
    localStorage.removeItem('agent_messages')
  }

  return (
    <div className="h-screen flex flex-col max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">AI 助手</h1>
        <button 
          className="text-sm text-gray-500 hover:text-gray-700"
          onClick={clearHistory}
        >
          清空对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              m.role === 'user' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white shadow-sm border border-gray-100'
            }`}>
              {m.role === 'assistant' ? (
                <div className="overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content || (loading && i === messages.length - 1 ? '▊' : '')}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <input 
          className="flex-1 border rounded-xl px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={input} 
          onChange={e => setInput(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} 
          placeholder="输入消息..."
          disabled={loading}
        />
        <button 
          className="bg-blue-500 text-white px-5 py-3 rounded-xl min-h-[48px] hover:bg-blue-600 disabled:opacity-50"
          onClick={send} 
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : '发送'}
        </button>
      </div>
    </div>
  )
}