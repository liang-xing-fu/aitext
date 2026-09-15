export const runtime = 'nodejs'
import { NextRequest } from 'next/server'
import { searchDocuments, getDocumentCount } from '@/lib/knowledge-base'
import { getToolsForAPI, executeToolByName } from '@/lib/tools-client'
// 内存向量存储（跟 RAG 共用）
let documents: { text: string; embedding: number[] }[] = []
// 会话记忆存储（key: sessionId, value: messages[]）
const sessions = new Map<string, { role: string; content: string }[]>()

function getOrCreateSession(sessionId: string) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, [])
  }
  return sessions.get(sessionId)!
}

// 原来硬编码的 tools 数组删除，改成：
const tools = getToolsForAPI()

// 工具执行函数
function executeTool(name: string, args: any): string {
  if (name === 'get_current_time') {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  }
  if (name === 'calculate') {
    try {
      const result = Function(`"use strict"; return (${args.expression})`)()
      return String(result)
    } catch (e) {
      return '计算失败：表达式有误'
    }
  }
  if (name === 'search_knowledge_base') {
    const result = searchDocuments(args.query)
    if (!result) {
      return '知识库为空，请先上传文档'
    }
    return `以下是知识库中相关内容：\n${result}`
  }
  return '未知工具'
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message } = await req.json()
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!sessionId) {
      return Response.json({ success: false, message: '缺少 sessionId' })
    }
    // 获取该会话的历史消息
    const history = getOrCreateSession(sessionId)

    // 加入用户新消息
    history.push({ role: 'user', content: message })
    const systemPrompt = {
      role: 'system',
      content: `你是一个智能助手，拥有以下能力：
      1. 查询知识库（search_knowledge_base）：当用户问到知识库中的内容时，必须使用此工具
      2. 获取当前时间（get_current_time）
      3. 数学计算（calculate）

      规则：
      - 如果用户问的问题可能涉及已上传的文档，优先使用 search_knowledge_base 工具查询
      - 只有工具返回空结果时，才用自己的知识回答
      - 不要猜测知识库里有什么，直接去查`
    }
    // 第一轮：让模型决定是否调工具
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [ systemPrompt, ...history ],
        tools,
        tool_choice: 'required'
      })
    })

    const data = await response.json()
    const msg = data.choices[0].message

    // 如果模型决定调工具
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // 在执行工具的地方：
      const toolPromises = msg.tool_calls.map(async (call: any) => {
        const name = call.function.name
        const args = JSON.parse(call.function.arguments)
        console.log(`调用工具: ${name}`, args)

        const result = await executeToolByName(name, args)
        console.log(`工具返回:`, result)

        return {
          role: 'tool' as const,
          tool_call_id: call.id,
          content: result
        }
      })

      // 等待所有工具执行完毕
      const toolResults = await Promise.all(toolPromises)

      // 第二轮：把工具结果喂回给模型
      const finalMessages = [
        systemPrompt,
        ...history,
        msg,
        ...toolResults
      ]
      const finalResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [systemPrompt, ...finalMessages],
          stream: true
        })
      })

      // 流式读取 + 实时推送
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
            
            // 按双换行分割
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

          // 保存完整回复到历史
          history.push({ role: 'assistant', content: fullContent })
          controller.close()
        }
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' }
      })
      // ✅ 保存助手回复到历史
      // history.push({ role: 'assistant', content: answer })
      // return Response.json({
      //   success: true,
      //   message: finalData.choices[0].message.content
      // })
    } 
    // ✅ 关键：模型直接回答也必须流式（否则前端等很久）
    else {
      const directResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [systemPrompt, ...history], stream: true })
      })
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          const reader = directResponse.body!.getReader()
          const decoder = new TextDecoder()
          let fullContent = '', buffer = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n'); buffer = parts.pop() || ''
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
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }

  } catch (e: any) {
    console.error('Agent 错误:', e)
    return Response.json({
      success: false,
      message: `错误：${e.message}`
    })
  }
}