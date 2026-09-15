'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}
// 新增：工具调用日志的类型
interface ToolLog {
  toolName: string
  args: string
  result: string
  timestamp: number
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolLog, setToolLog] = useState<string[]>([])
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([])  // 新增：工具日志状态
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolLogs])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setToolLog([])
    setToolLogs([])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages })
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text
          .split('\n')
          .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')

        for (const line of lines) {
          try {
            const json = JSON.parse(line.replace('data: ', ''))
            console.log('解析后的 JSON:', json)  // ← 加这行

            // 识别工具调用日志事件
            if (json.type === 'tool_logs') {
              console.log('收到工具日志:', json.logs)  // ← 加这行
              setToolLogs(json.logs)
              continue
            }
            const delta = json.choices?.[0]?.delta?.content || ''
            // 如果返回了工具调用信息，记录到日志
            const toolCalls = json.choices?.[0]?.delta?.tool_calls
            if (toolCalls) {
              for (const call of toolCalls) {
                if (call.function) {
                  setToolLogs(prev => [...prev, {
                    toolName: call.function.name,
                    args: call.function.arguments || '{}',
                    result: '',
                    timestamp: Date.now()
                  }])
                }
              }
            }
            assistantContent += delta
            setMessages(prev => {
              const newMessages = [...prev]
              newMessages[newMessages.length - 1] = {
                role: 'assistant',
                content: assistantContent
              }
              return newMessages
            })
          } catch (e) {
            // 忽略非 JSON 行
          }
        }
      }
    } catch (error) {
      console.error('请求失败:', error)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '抱歉，请求失败了，请稍后再试。' }
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">AI 聊天（Tool Calling）</h1>
      <p className="text-sm text-gray-500 mb-4">
        试试：现在几点？ / 佛山天气怎么样？ / 123 * 456
      </p>

      {/* 新增：工具调用日志面板 */}
      {toolLogs.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-semibold text-yellow-800 mb-2">🔧 工具调用记录</p>
          {toolLogs.map((log, i) => (
            <div key={i} className="text-xs text-yellow-700 mb-1">
              <span className="font-mono bg-yellow-100 px-1 rounded">
                {log.toolName}
              </span>
              <span className="text-yellow-500"> 参数: </span>
              <span className="font-mono">{JSON.stringify(log.args)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              msg.role === 'user' ? 'bg-blue-100 ml-12' : 'bg-gray-100 mr-12'
            }`}
          >
            <p className="font-semibold text-sm mb-1">
              {msg.role === 'user' ? '你' : 'AI'}
            </p>
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区域 */}
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="输入消息..."
          disabled={loading}
        />
        <button
          className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  )
}
