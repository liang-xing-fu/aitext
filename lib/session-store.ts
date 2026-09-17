// lib/session-store.ts
import fs from 'fs'
import path from 'path'

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions')

// 确保目录存在
function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

// 获取会话文件的路径
function getSessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`)
}

// 保存会话历史到文件
export function saveSession(sessionId: string, history: { role: string; content: string }[]) {
  ensureDir()
  const filePath = getSessionFilePath(sessionId)
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8')
}

// 从文件读取会话历史
export function loadSession(sessionId: string): { role: string; content: string }[] | null {
  const filePath = getSessionFilePath(sessionId)
  if (!fs.existsSync(filePath)) {
    return null
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

// 删除会话文件
export function deleteSession(sessionId: string) {
  const filePath = getSessionFilePath(sessionId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

// 列出所有会话 ID
export function listSessions(): string[] {
  ensureDir()
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
}