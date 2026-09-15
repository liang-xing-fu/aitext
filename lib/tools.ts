// lib/tools.ts

// 工具定义接口
interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  handler: (args: any) => string | Promise<string>
}

// 所有工具注册在这里
const toolRegistry: ToolDefinition[] = [
  {
    name: 'get_current_time',
    description: '获取当前时间',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: () => {
      return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
  },
  {
    name: 'calculate',
    description: '计算数学表达式',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '数学表达式，如 "1+2 * 3"'
        }
      },
      required: ['expression']
    },
    handler: (args) => {
      try {
        return String(Function(`"use strict"; return (${args.expression})`)())
      } catch {
        return '计算失败：表达式有误'
      }
    }
  },
  {
    name: 'search_knowledge_base',
    description: '搜索知识库，查找与问题相关的文档内容',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词或问题'
        }
      },
      required: ['query']
    },
    handler: (args) => {
      const { searchDocuments } = require('./knowledge-base')
      const result = searchDocuments(args.query)
      return result || '知识库为空，请先上传文档'
    }
  }
]

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

// 动态注册新工具
export function registerTool(tool: ToolDefinition) {
  // 检查是否已存在同名工具
  const existing = toolRegistry.findIndex(t => t.name === tool.name)
  if (existing !== -1) {
    toolRegistry[existing] = tool  // 覆盖
  } else {
    toolRegistry.push(tool)  // 新增
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