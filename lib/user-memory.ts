// lib/user-memory.ts
import fs from 'fs'
import path from 'path'

const MEMORY_DIR = path.join(process.cwd(), 'data', 'memories')

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true })
  }
}

function getMemoryFilePath(userId: string): string {
  return path.join(MEMORY_DIR, `${userId}.json`)
}

// 加载用户的长期记忆
export function loadUserMemory(userId: string): string[] {
  const filePath = getMemoryFilePath(userId)
  if (!fs.existsSync(filePath)) {
    return []
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

// 保存用户的长期记忆
export function saveUserMemory(userId: string, memories: string[]) {
  ensureDir()
  const filePath = getMemoryFilePath(userId)
  fs.writeFileSync(filePath, JSON.stringify(memories, null, 2), 'utf-8')
}

// 提取新信息并更新记忆
export async function extractAndUpdateMemory(userId: string, conversation: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return

  const existingMemories = loadUserMemory(userId)
  
  // 调用 LLM 从对话中提取需要记住的信息
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个记忆提取助手。从对话中提取关于用户的重要信息（姓名、偏好、地点、事实等）。
          已有的记忆：${JSON.stringify(existingMemories)}
          
          规则：
          - 只提取新的事实性信息
          - 每条记忆是一句简短陈述
          - 如果已有相同信息，不要重复
          - 只输出 JSON 数组，如 ["用户叫张三", "用户喜欢简短回答"]`
        },
        {
          role: 'user',
          content: `对话内容：\n${conversation}`
        }
      ],
      stream: false
    })
  })

  const data = await res.json()
  const content = data.choices[0].message.content
  
  try {
    const newMemories = JSON.parse(content)
    if (Array.isArray(newMemories) && newMemories.length > 0) {
      // 合并新旧记忆，去重
      const merged = [...new Set([...existingMemories, ...newMemories])]
      saveUserMemory(userId, merged)
      console.log(`[长期记忆] 更新了 ${newMemories.length} 条新记忆`)
    }
  } catch {
    console.log('[长期记忆] 解析失败，跳过')
  }
}