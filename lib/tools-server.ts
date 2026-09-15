// lib/tools-server.ts
// 这个文件只会在服务端运行

import fs from 'fs'
import path from 'path'

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  handler: (args: any) => string | Promise<string>
}

// 默认工具处理器
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
    const { searchDocuments } = require('./knowledge-base')
    const result = searchDocuments(args.query)
    return result || '知识库为空，请先上传文档'
  },
  get_weather: async (args) => {
    // 模拟天气查询（实际可接真实 API）
    const weatherData: Record<string, number> = {
      '北京': 22,
      '上海': 28,
      '广州': 32,
      '深圳': 30,
      '杭州': 25,
      '成都': 26,
      '武汉': 29,
      '西安': 24
    }
    const temp = weatherData[args.city]
    if (temp === undefined) {
      return `暂未收录 ${args.city} 的天气数据`
    }
    return `${args.city} 当前气温 ${temp}°C`
  },

  recommend_outfit: (args) => {
    const temp = args.temperature
    let suggestion = ''
    if (temp >= 35) {
      suggestion = '短袖短裤，注意防暑，随身带水'
    } else if (temp >= 28) {
      suggestion = '短袖短裤或连衣裙，透气为主'
    } else if (temp >= 22) {
      suggestion = '短袖配薄外套，早晚微凉'
    } else if (temp >= 16) {
      suggestion = '长袖衬衫或卫衣，搭配牛仔裤'
    } else if (temp >= 10) {
      suggestion = '薄毛衣或夹克，注意保暖'
    } else {
      suggestion = '厚羽绒服，围巾手套必备'
    }
    return `${args.city} 当前 ${temp}°C，建议穿搭：${suggestion}`
  }
}

// 从 JSON 文件加载工具定义
function loadToolsFromFile(): ToolDefinition[] {
  const filePath = path.join(process.cwd(), 'config', 'tools.json')
  
  if (!fs.existsSync(filePath)) {
    console.warn('tools.json 不存在，使用默认工具')
    return Object.entries(defaultHandlers).map(([name, handler]) => ({
      name,
      description: '',
      parameters: { type: 'object', properties: {}, required: [] },
      handler
    }))
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const toolsConfig = JSON.parse(raw)

  return toolsConfig.map((t: any) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    handler: defaultHandlers[t.name] || ((args) => `未实现的工具: ${t.name}`)
  }))
}

// 工具注册表
let toolRegistry: ToolDefinition[] = loadToolsFromFile()

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