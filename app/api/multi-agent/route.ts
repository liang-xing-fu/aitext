export const runtime = 'nodejs'
import { NextRequest } from 'next/server'
import { searchDocuments } from '@/lib/knowledge-base'

const WORKER_PROMPTS: Record<string, string> = {
  researcher: '你负责从知识库结果中找关键信息，只输出事实摘要。',
  calculator: '你负责数学计算，只输出计算过程和结果。',
  writer: '你负责把前面子 Agent 的结果，整理成最终给用户的中文回答。'
}

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

  // 记录所有步骤的日志
  const steps: Array<{
    worker: string
    input: string
    output: string
    duration: number
    status: 'success' | 'error'
  }> = []

  // 1. 主管做规划
  const supervisorStart = Date.now()
  let supervisorReply: string
  try {
    supervisorReply = await callLLM(
      `你是一个主管 Agent。子 Agent 有 researcher/calculator/writer。
       如果需要多个子 Agent，只输出 JSON：
       {"plan":[{"worker":"researcher","task":"..."},{"worker":"calculator","task":"..."},{"worker":"writer","task":"..."}]}
       如果一句话能答，就直接回答。`,
      message
    )
    steps.push({
      worker: 'supervisor',
      input: message,
      output: supervisorReply,
      duration: Date.now() - supervisorStart,
      status: 'success'
    })
  } catch (e: any) {
    steps.push({
      worker: 'supervisor',
      input: message,
      output: e.message,
      duration: Date.now() - supervisorStart,
      status: 'error'
    })
    return Response.json({ success: true, mode: 'multi-agent', message: '主管分析失败', steps })
  }

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
    return Response.json({ success: true, mode: 'single', message: supervisorReply, steps })
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

    const workerStart = Date.now()
    try {
      const out = await callLLM(system, task)
      context.push(`[${step.worker}]\n${out}`)
      steps.push({
        worker: step.worker,
        input: task,
        output: out,
        duration: Date.now() - workerStart,
        status: 'success'
      })
    } catch (e: any) {
      steps.push({
        worker: step.worker,
        input: task,
        output: e.message,
        duration: Date.now() - workerStart,
        status: 'error'
      })
      context.push(`[${step.worker}]\n（执行出错）`)
    }
  }

  return Response.json({
    success: true,
    mode: 'multi-agent',
    message: context[context.length - 1],
    steps
  })
}