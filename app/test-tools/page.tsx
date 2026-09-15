'use client'

import { useState, useRef } from 'react'
import { registerTool } from '@/lib/tools'

export default function TestToolsPage() {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  // 生成一个固定的 sessionId，刷新页面后不会变（但刷新后动态注册的工具会丢失）
  const sessionIdRef = useRef('test-session-' + Math.random().toString(36).substring(7))

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev])
  }
  // 通用请求函数
  const sendToAgent = async (message: string) => {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId: sessionIdRef.current,
        message
      })
    })

    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      // 流式返回：读取全部内容再显示
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
            if (json.content) fullContent += json.content
          } catch {}
        }
      }
      return fullContent || '(空回复)'
    } else {
      // JSON 返回
      const data = await res.json()
      return data.message || JSON.stringify(data)
    }
  }
  // 测试1：调用已存在的默认工具（如计算）
  const testDefaultTool = async () => {
    setLoading(true)
    addLog('开始测试默认工具: calculate(1+2 * 3)...')
    try {
      const reply = await sendToAgent('帮我计算 1+2 * 3 等于多少')
      addLog(`Agent 回复: ${reply}`)
    } catch (e: any) {
      addLog(`错误: ${e.message}`)
    }
    setLoading(false)
  }

  // 测试2：动态注册翻译工具
  const handleDynamicRegister = () => {
    addLog('正在动态注册 "translate_text" 工具...')
    registerTool({
      name: 'translate_text',
      description: '将文本翻译成指定语言',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要翻译的文本' },
          target_lang: { type: 'string', description: '目标语言，如 "en"、"ja"' }
        },
        required: ['text', 'target_lang']
      },
      handler: async (args) => {
        addLog(`(工具执行中) 翻译 "${args.text}" 到 ${args.target_lang}`)
        return `[模拟翻译结果] 原文: ${args.text} => 译文: (模拟翻译到${args.target_lang})`
      }
    })
    addLog('注册成功！现在可以在下方测试翻译，或直接问 Agent "把你好世界翻译成英文"')
  }

  // 测试3：测试刚注册的翻译工具（通过 Agent）
  const testTranslateTool = async () => {
    setLoading(true)
    addLog('开始测试动态工具: 翻译 "你好世界"...')
    try {
      const reply = await sendToAgent('请把"你好世界"翻译成英文，只调用工具不废话')
      addLog(`Agent 回复: ${reply}`)
    } catch (e: any) {
      addLog(`错误: ${e.message}`)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 text-gray-800 dark:text-gray-200">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">🛠️ 动态工具注册测试</h1>

        <div className="space-y-4 mb-8">
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h3 className="font-semibold mb-2">1. 测试默认工具（计算）</h3>
            <button 
              onClick={testDefaultTool}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              测试 calculate 工具
            </button>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h3 className="font-semibold mb-2">2. 动态注册新工具</h3>
            <button 
              onClick={handleDynamicRegister}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              注册 translate_text 工具
            </button>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h3 className="font-semibold mb-2">3. 测试动态工具（翻译）</h3>
            <button 
              onClick={testTranslateTool}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              测试翻译工具 (需先注册)
            </button>
          </div>
        </div>

        <div className="bg-black/90 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto">
          <div className="mb-2 text-white">--- 测试日志 ---</div>
          {logs.length === 0 && <div className="opacity-50">暂无日志...</div>}
          {logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
        </div>
      </div>
    </div>
  )
}