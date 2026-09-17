export const runtime = 'nodejs'
import { NextRequest } from 'next/server'
import { searchDocuments } from '@/lib/knowledge-base'

// Worker 的系统提示词
const WORKER_PROMPTS: Record<string, string> = {
  researcher: '你负责从知识库结果中找关键信息，只输出事实摘要。',
  calculator: '你负责数学计算，只输出计算过程和结果。',
  writer: '你负责把前面子 Agent 的结果，整理成最终给用户的中文回答。'
}

// 通用的 LLM 调用函数
async function callLLM(system: string, user: string) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      stream: false
    })
  })
  const data = await res.json()
  return data.choices[0].message.content
}

export async function POST(req: NextRequest) {
  const { sessionId, message } = await req.json()
  if (!sessionId) return Response.json({ success: false, message: '缺少 sessionId' })

  // 1. 主管做规划
  const supervisorReply = await callLLM(
    `你是一个主管 Agent。子 Agent 有 researcher/calculator/writer。
     如果需要多个子 Agent，只输出 JSON：
     {"plan":[{"worker":"researcher","task":"..."},{"worker":"calculator","task":"..."},{"worker":"writer","task":"..."}]}
     如果一句话能答，就直接回答。`,
    message
  )

  // 2. 尝试解析成多 Agent 计划
  let plan: { worker: string; task: string }[] = []
  try {
    const json = supervisorReply.trim().match(/\{[\s\S]*\}/)?.[0]
    if (json) {
      plan = JSON.parse(json).plan ?? []
    }
  } catch {
    plan = []
  }

  // 3. 不需要拆：直接回
  if (plan.length === 0) {
    return Response.json({ success: true, mode: 'single', message: supervisorReply })
  }

  // 4. 执行 Worker
  const context: string[] = []
  for (const step of plan) {
    let task = step.task
    let system = WORKER_PROMPTS[step.worker] ?? '你是子 Agent。'

    if (step.worker === 'researcher') {
      const kb = searchDocuments(task)
      task = `用户问题：${task}\n\n知识库内容：\n${kb || '（空）'}`
    }

    if (step.worker === 'writer') {
      task = `${task}\n\n已有材料：\n${context.join('\n---\n')}`
    }

    const out = await callLLM(system, task)
    context.push(`[${step.worker}]\n${out}`)
  }

  return Response.json({
    success: true,
    mode: 'multi-agent',
    message: context[context.length - 1]
  })
}