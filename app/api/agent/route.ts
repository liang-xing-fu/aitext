export const runtime = 'nodejs'
import { NextRequest } from 'next/server'
import { searchDocuments, getDocumentCount } from '@/lib/knowledge-base'
import { getToolsForAPI, executeToolByName } from '@/lib/tools-server'
import { loadSession, saveSession } from '@/lib/session-store'
import { loadUserMemory, extractAndUpdateMemory } from '@/lib/user-memory'

const sessions = new Map<string, { role: string; content: string }[]>()

// 替换原来的 getOrCreateSession
function getOrCreateSession(sessionId: string) {
  // 先从文件加载
  const saved = loadSession(sessionId)
  if (saved) {
    return saved
  }
  // 不存在则创建新的空历史
  return []
}

const tools = getToolsForAPI()

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message } = await req.json()

    // 加载用户的长期记忆
    const userMemories = loadUserMemory(sessionId)
    const memoryContext = userMemories.length > 0 
      ? `\n\n关于用户已知信息：\n${userMemories.map(m => `- ${m}`).join('\n')}`
      : ''

    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!sessionId) {
      return Response.json({ success: false, message: '缺少 sessionId' })
    }
    
    const history = getOrCreateSession(sessionId)
    history.push({ role: 'user', content: message })

    const systemPrompt = {
      role: 'system',
      content: `你是一个智能助手${memoryContext}，必须使用工具来回答问题。

可用工具：
1. get_current_time - 获取当前时间
2. calculate - 数学计算，参数 expression 为数学表达式
3. search_knowledge_base - 搜索知识库，参数 query 为搜索关键词
4. get_weather - 查询天气，参数 city 为城市名
5. recommend_outfit - 根据温度推荐穿搭，参数 temperature 为温度值，city 为城市名

规则：
- 对于用户的每一个请求，你必须调用相应的工具来获取信息
- 如果用户问天气，先调用 get_weather 获取温度，然后把温度传给 recommend_outfit 获取穿搭建议
- 如果用户问时间，调用 get_current_time
- 如果用户要计算，调用 calculate
- 如果用户问知识库内容，调用 search_knowledge_base
- 不要自己编造答案，必须依赖工具返回的结果`
    }

    // 第一轮：强制调工具
    const firstResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemPrompt, ...history],
        tools,
        tool_choice: 'required'
      })
    })

    const firstData = await firstResponse.json()
    let msg = firstData.choices[0].message

    // 多轮工具调用循环
    let maxRounds = 5
    let currentRound = 0

    while (currentRound < maxRounds) {
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        break
      }

      history.push(msg)

      const toolPromises = msg.tool_calls.map(async (call: any) => {
        const name = call.function.name
        const args = JSON.parse(call.function.arguments)
        console.log(`[第${currentRound + 1}轮] 调用工具: ${name}`, args)

        const result = await executeToolByName(name, args)
        console.log(`[第${currentRound + 1}轮] 工具返回:`, result)

        return {
          role: 'tool' as const,
          tool_call_id: call.id,
          content: result
        }
      })

      const toolResults = await Promise.all(toolPromises)
      history.push(...toolResults)

      // 后续轮次用 auto，让模型自己决定是否还需要调工具
      const nextResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [systemPrompt, ...history],
          tools,
          tool_choice: 'auto'
        })
      })

      const nextData = await nextResponse.json()
      msg = nextData.choices[0].message
      currentRound++
    }

    // 到这里已经没有工具调用了，开始流式输出最终答案
    if (!msg.content) {
      msg.content = '抱歉，无法获取到有效信息。'
    }
    history.push(msg)

    const finalResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemPrompt, ...history],
        stream: true
      })
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = finalResponse.body!.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data: ')) continue
            
            const jsonStr = line.slice(6)
            if (jsonStr === '[DONE]') continue

            try {
              const json = JSON.parse(jsonStr)
              const delta = json.choices[0]?.delta?.content || ''
              if (delta) {
                fullContent += delta
                controller.enqueue(encoder.encode(JSON.stringify({ content: delta }) + '\n'))
              }
            } catch {}
          }
        }

        history.push({ role: 'assistant', content: fullContent })
        controller.close()
      }
    })

    // 保存会话到文件
    saveSession(sessionId, history)
    
    // 异步提取新记忆
    const lastMessages = history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')
    extractAndUpdateMemory(sessionId, lastMessages).catch(console.error)

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' }
    })

  } catch (e: any) {
    console.error('Agent 错误:', e)
    return Response.json({
      success: false,
      message: `错误：${e.message}`
    })
  }
}