import { NextRequest } from 'next/server'

// 工具定义：告诉模型它有这个工具可用
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前的日期和时间',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行数学计算，支持加减乘除和括号',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式，例如 "123 * 456" 或 "(1 + 2) * 3"'
          }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的实时天气情况。当用户询问天气、温度、湿度、风力等信息时调用',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，如 "佛山"、"广州"、"北京"'
          }
        },
        required: ['city']
      }
    }
  }
]

// 执行工具的函数
async function executeTool(toolName: string, args: any) {
  if (toolName === 'get_current_time') {
    const now = new Date()
    const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    return timeStr
  }
  if (toolName === 'calculate') {
    const { expression } = args
    try {
      // 安全校验：只允许数字、运算符、括号、小数点、空格
      const safePattern = /^[\d+\-*/().%\s]+$/
      if (!safePattern.test(expression)) {
        return '错误：表达式包含非法字符，只允许数字和 + - * / ( ) . %'
      }
      // 使用 Function 构造函数代替 eval，更安全
      const result = new Function(`return (${expression})`)()
      return String(result)
    } catch (e) {
      return `计算错误：请检查表达式格式`
    }
  }
  // 工具3：天气
  if (toolName === 'get_weather') {
  const { city } = args
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%h+%w`)
    const text = await res.text()
    return `${city} 当前天气：${text}`
  } catch (e: any) {
    return `查询天气出错：${e.message}`
  }
}
  return '未知工具'
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  // 第一步：带着 tools 定义请求 DeepSeek
  const firstRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一个有用的助手。当你需要使用工具时，请使用提供的工具。' },
        ...messages
      ],
      tools: tools,
      tool_choice: 'auto',
      stream: false
    })
  })

  const firstData = await firstRes.json()
  const firstChoice = firstData.choices?.[0]
  const firstMsg = firstChoice?.message

  // 如果模型决定调工具
  if (firstMsg?.tool_calls && firstMsg.tool_calls.length > 0) {
    messages.push(firstMsg)

    // 构建工具调用日志
    const toolCallLogs: any[] = []

    for (const call of firstMsg.tool_calls) {
      const args = JSON.parse(call.function.arguments)
      toolCallLogs.push({
        toolName: call.function.name,
        args: args
      })

      const result = await executeTool(call.function.name, args)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result
      })
    }

    // 第2次请求：带着工具结果让 DeepSeek 组织回答（流式）
    const secondRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        stream: true
      })
    })

    // 读取 DeepSeek 的完整流式响应
    const reader = secondRes.body!.getReader()
    const decoder = new TextDecoder()
    let deepseekText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      deepseekText += decoder.decode(value, { stream: true })
    }

    // 在 DeepSeek 的响应前面加上工具日志
    const logEvent = `data: ${JSON.stringify({ type: 'tool_logs', logs: toolCallLogs })}\n\n`
    const combinedResponse = logEvent + deepseekText

    return new Response(combinedResponse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  }

  // 如果模型没调工具，直接返回普通流式响应
  const normalRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      stream: true
    })
  })

  return new Response(normalRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}