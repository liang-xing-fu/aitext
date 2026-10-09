'use client'

import { useState } from 'react'

interface Step {
  worker: string
  input: string
  output: string
  duration: number
  status: 'success' | 'error'
}

export default function MultiAgentTestPage() {
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const sessionId = 'multi-agent-test-' + Math.random().toString(36).substring(7)

  const handleSubmit = async () => {
    if (!input.trim()) return
    setLoading(true)
    setResponse('')
    setSteps([])

    try {
      const res = await fetch('/api/multi-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: input })
      })
      const data = await res.json()
      setResponse(data.message || '（无返回）')
      if (data.steps) {
        setSteps(data.steps)
        setShowDebug(true)
      }
    } catch (e: any) {
      setResponse(`错误：${e.message}`)
    }

    setLoading(false)
  }

  // 获取 Worker 对应的颜色
  const getWorkerColor = (worker: string) => {
    const colors: Record<string, string> = {
      supervisor: 'bg-purple-100 border-purple-300 text-purple-800',
      researcher: 'bg-blue-100 border-blue-300 text-blue-800',
      calculator: 'bg-green-100 border-green-300 text-green-800',
      writer: 'bg-orange-100 border-orange-300 text-orange-800'
    }
    return colors[worker] || 'bg-gray-100 border-gray-300 text-gray-800'
  }

  const getWorkerLabel = (worker: string) => {
    const labels: Record<string, string> = {
      supervisor: '🧠 主管',
      researcher: '🔍 研究员',
      calculator: '🧮 计算器',
      writer: '✍️ 写手'
    }
    return labels[worker] || worker
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
          🤖 多 Agent 协作测试
        </h1>

        {/* 输入区 */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="输入问题，例如：帮我查一下退款规则，然后算 199×3+50，最后整理成一段话"
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

        {/* 最终回答 */}
        {response && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
              📝 最终回答
            </h2>
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-gray-800 dark:text-gray-200">
              {response}
            </div>
          </div>
        )}

        {/* 调试面板 */}
        {showDebug && steps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                🔧 执行过程
              </h2>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showDebug ? '收起' : '展开'}
              </button>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`border rounded-lg overflow-hidden ${getWorkerColor(step.worker)}`}
                >
                  {/* 步骤头 */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-inherit bg-opacity-50">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {getWorkerLabel(step.worker)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        step.status === 'success'
                          ? 'bg-green-200 text-green-800'
                          : 'bg-red-200 text-red-800'
                      }`}>
                        {step.status === 'success' ? '✓ 成功' : '✗ 失败'}
                      </span>
                    </div>
                    <span className="text-sm opacity-75">
                      ⏱ {step.duration}ms
                    </span>
                  </div>

                  {/* 输入 */}
                  <details className="px-4 py-2 border-b border-inherit bg-white/50">
                    <summary className="cursor-pointer text-sm font-medium opacity-75">
                      输入
                    </summary>
                    <pre className="mt-2 text-xs whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                      {step.input}
                    </pre>
                  </details>

                  {/* 输出 */}
                  <details className="px-4 py-2 bg-white/50">
                    <summary className="cursor-pointer text-sm font-medium opacity-75">
                      输出
                    </summary>
                    <pre className="mt-2 text-xs whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                      {step.output}
                    </pre>
                  </details>
                </div>
              ))}
            </div>

            {/* 统计信息 */}
            <div className="mt-4 p-4 bg-white dark:bg-gray-800 border rounded-lg">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                📊 统计
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    {steps.length}
                  </p>
                  <p className="text-xs text-gray-500">步骤数</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    {steps.reduce((sum, s) => sum + s.duration, 0)}ms
                  </p>
                  <p className="text-xs text-gray-500">总耗时</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    {steps.filter(s => s.status === 'success').length}/{steps.length}
                  </p>
                  <p className="text-xs text-gray-500">成功率</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}