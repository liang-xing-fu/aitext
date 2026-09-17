'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 生成唯一 sessionId
function generateSessionId() {
  if (typeof window !== 'undefined') {
    let id = localStorage.getItem('agent-session-id')
    if (!id) {
      id = 'session-' + Math.random().toString(36).substring(7)
      localStorage.setItem('agent-session-id', id)
    }
    return id
  }
  return 'session-' + Math.random().toString(36).substring(7)
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef(generateSessionId())
// 在组件内，useEffect 部分添加
useEffect(() => {
  // 页面加载时获取历史
  fetch(`/api/history?sessionId=${sessionId.current}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.messages.length > 0) {
        setMessages(data.messages)
      }
    })
    .catch(err => console.error('加载历史失败:', err))
}, [])
  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setIsStreaming(true)
    setError(null)

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current,
          message: userMessage.content
        })
      })

      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      // 先添加一个空的 assistant 消息，用于流式填充
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString()
      }])

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
              // 更新最后一条消息（assistant 的消息）
              setMessages(prev => {
                const newMessages = [...prev]
                const lastIndex = newMessages.length - 1
                if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                  newMessages[lastIndex] = {
                    ...newMessages[lastIndex],
                    content: fullContent
                  }
                }
                return newMessages
              })
            }
          } catch {}
        }
      }
    } catch (e: any) {
      debugger
      console.log('2333')
      setError(e.message || '请求失败，请重试')
      setIsLoading(false)
      setIsStreaming(false)
    }
  }

  const handleRetry = () => {
    setError(null)
    // 重新发送最后一条用户消息
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      setInput(lastUserMsg.content)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* 头部 */}
      <header className="bg-white dark:bg-gray-800 shadow-sm px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
          🤖 AI 助手
        </h1>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-4xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-4xl mb-4">👋</p>
            <p>你好！我是你的 AI 助手，有什么可以帮助你的？</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm rounded-bl-md'
              }`}
            >
              {/* 消息内容 - Markdown 渲染 */}
              {msg.role === 'assistant' ? (
                <div className="prose dark:prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || (isStreaming && index === messages.length - 1 ? '▊' : '')}
                  </ReactMarkdown>
                  {/* 流式输出时的光标 */}
                  {isStreaming && index === messages.length - 1 && msg.content && (
                    <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              
              {/* 时间戳 */}
              <p className={`text-xs mt-1 ${
                msg.role === 'user' ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'
              }`}>
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
        {/* AI 思考动画 */}
        {isLoading && !messages.some(m => m.role === 'assistant' && m.content === '') && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">思考中...</span>
              </div>
            </div>
          </div>
        )}
        {/* 错误提示 */}
        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
              <button
                onClick={handleRetry}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border dark:border-gray-600 px-4 py-3 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 
                       dark:bg-gray-700 dark:text-gray-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors font-medium"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                生成中
              </span>
            ) : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}