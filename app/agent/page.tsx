'use client'
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AgentPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const sessionIdRef = useRef(Math.random().toString(36).substring(7))
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')

    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    
    // 先创建一个空的助手消息占位
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
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

      if (!res.ok) {
        throw new Error('请求失败')
      }

      const contentType = res.headers.get('content-type') || ''
      
      if (contentType.includes('text/event-stream')) {
        // 流式读取
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
                // 实时更新最后一条消息
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
        // 非流式响应（比如错误）
        const data = await res.json()
        if (data.success) {
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: data.message }
            return updated
          })
        } else {
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: '❌ ' + data.message }
            return updated
          })
        }
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

  return (
    <div className="h-screen flex flex-col max-w-3xl mx-auto p-4">
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white shadow-sm'}`}>
              {m.role === 'assistant' ? (
                <div className="overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <input className="flex-1 border rounded-xl px-4 py-3 min-h-[48px]" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="输入消息..." />
        <button className="bg-blue-500 text-white px-5 py-3 rounded-xl min-h-[48px]" onClick={send} disabled={loading}>发送</button>
      </div>
    </div>
  )
}