// lib/tools-client.ts
// 这个文件只能在客户端使用（不包含 fs）

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  handler: (args: any) => string | Promise<string>
}

// 默认工具处理器（仅客户端可用，用于测试）
const defaultHandlers: Record<string, (args: any) => string | Promise<string>> = {
  get_current_time: () => {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  },
  calculate: (args) => {
    try {
      return String(Function(`"use strict"; return (${args.expression})`)())
    } catch {
      return '计算失败：表达式有误'
    }
  },
  search_knowledge_base: (args) => {
    return '客户端无法直接查询知识库，请通过 API 调用'
  }
}

// 工具注册表（初始为空，由服务端注入）
let toolRegistry: ToolDefinition[] = []

// 初始化工具列表（从服务端获取）
export async function initToolsFromServer() {
  try {
    const res = await fetch('/api/tools')
    const data = await res.json()
    if (data.tools) {
      toolRegistry = data.tools.map((t: any) => ({
        ...t,
        handler: defaultHandlers[t.name] || ((args) => `未实现的工具: ${t.name}`)
      }))
    }
  } catch (e) {
    console.error('获取工具列表失败:', e)
  }
}

// 导出工具列表（OpenAI 格式）
export function getToolsForAPI() {
  return toolRegistry.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

// 执行工具
export async function executeToolByName(name: string, args: any): Promise<string> {
  const tool = toolRegistry.find(t => t.name === name)
  if (!tool) return `未知工具：${name}`
  return await tool.handler(args)
}

// 动态注册新工具（运行时）
export function registerTool(tool: ToolDefinition) {
  const existing = toolRegistry.findIndex(t => t.name === tool.name)
  if (existing !== -1) {
    toolRegistry[existing] = tool
  } else {
    toolRegistry.push(tool)
  }
  console.log(`工具 "${tool.name}" 已注册`)
}

// 列出所有已注册工具
export function listTools() {
  return toolRegistry.map(t => ({
    name: t.name,
    description: t.description
  }))
}