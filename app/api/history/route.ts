import { NextRequest } from 'next/server'
import { loadSession } from '@/lib/session-store'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) {
    return Response.json({ success: false, messages: [] })
  }

  const history = loadSession(sessionId)
  if (!history) {
    return Response.json({ success: true, messages: [] })
  }

  // 过滤出 user 和 assistant 的消息，去掉 system 和 tool 消息
  const messages = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date().toLocaleTimeString() // 简化处理，不存真实时间戳
    }))

  return Response.json({ success: true, messages })
}