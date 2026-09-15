'use client'
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AgentPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const sessionIdRef = useRef(Math.random().toString(36).substring(7))
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // 初始化：读取本地缓存和主题设置
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

    const theme = localStorage.getItem('agent_theme')
    if (theme === 'dark') {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  // 保存消息到 localStorage
  useEffect(() => {
    localStorage.setItem('agent_messages', JSON.stringify(messages))
  }, [messages])

  // 自动滚动
  useEffect(() => {
    if (!showScrollBtn) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, showScrollBtn])

  // 监听滚动位置
  const handleScroll = () => {
    const container = chatContainerRef.current
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
      setShowScrollBtn(!isNearBottom)
    }
  }

  // 切换深色模式
  const toggleTheme = () => {
    const newDark = !darkMode
    setDarkMode(newDark)
    localStorage.setItem('agent_theme', newDark ? 'dark' : 'light')
    if (newDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const send = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')

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
    <div className={`h-screen flex flex-col transition-colors duration-300 ${
      darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'
    }`}>
      {/* 顶部导航栏 */}
      <div className={`flex items-center justify-between px-6 py-4 border-b transition-colors duration-300 ${
        darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors duration-300 ${
            darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
          }`}>
            AI
          </div>
          <h1 className="text-lg font-semibold">AI 助手</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
              darkMode ? 'hover:bg-gray-700 text-yellow-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
            title={darkMode ? '切换到浅色模式' : '切换到深色模式'}
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <button
            onClick={clearHistory}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
              darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-red-400' : 'hover:bg-gray-100 text-gray-500 hover:text-red-500'
            }`}
            title="清空对话"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* 聊天区域 */}
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className={`flex flex-col items-center justify-center h-full space-y-4 animate-fadeIn ${
            darkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300 ${
              darkMode ? 'bg-gray-800' : 'bg-gray-100'
            }`}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-lg font-medium">开始一段新的对话</p>
            <p className="text-sm">输入消息，我会尽力帮助你</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideUp`}
          >
            <div className={`max-w-[80%] transition-all duration-200 ${
              m.role === 'user'
                ? 'order-1'
                : 'order-1'
            }`}>
              {/* 角色标识 */}
              {m.role === 'assistant' && (
                <div className={`text-xs mb-1 ml-1 transition-colors duration-300 ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  AI 助手
                </div>
              )}
              
              <div className={`rounded-2xl px-4 py-3 transition-all duration-200 ${
                m.role === 'user'
                  ? 'bg-blue-500 text-white rounded-tr-md hover:shadow-lg'
                  : `${darkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900 shadow-sm border border-gray-100'} rounded-tl-md hover:shadow-md`
              }`}>
                {m.role === 'assistant' ? (
                  <div className="overflow-x-auto prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content || (loading && i === messages.length - 1 ? '▊' : '')}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>

              {/* 时间戳 */}
              {m.role === 'user' && (
                <div className={`text-xs mt-1 mr-1 text-right transition-colors duration-300 ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  刚刚
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 回到底部按钮 */}
      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className={`fixed bottom-24 right-8 p-2 rounded-full shadow-lg transition-all duration-300 animate-bounce ${
            darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}

      {/* 输入区域 */}
      <div className={`border-t px-4 py-4 transition-colors duration-300 ${
        darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
      }`}>
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            className={`flex-1 rounded-xl px-4 py-3 min-h-[48px] outline-none transition-all duration-200 focus:ring-2 ${
              darkMode 
                ? 'bg-gray-700 text-gray-100 placeholder-gray-400 border-gray-600 focus:ring-blue-500' 
                : 'bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200 focus:ring-blue-400'
            }`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="输入消息..."
            disabled={loading}
          />
          <button
            className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 min-h-[48px] ${
              loading || !input.trim()
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:scale-105 active:scale-95'
            } ${
              darkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            onClick={send}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                处理中
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                发送
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
} 