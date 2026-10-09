export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { loadDocument, appendDocument, searchDocuments, getDocumentCount } from '@/lib/knowledge-base'

// 解析不同格式的文件
async function parseFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const uint8Array = new Uint8Array(bytes)
  const name = file.name.toLowerCase()

  // PDF
  if (name.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse-debugging-disabled')
    const result = await pdfParse(Buffer.from(bytes))
    return result.text
  }

  // Word (.docx)
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    return result.value
  }

  // TXT / MD
  return new TextDecoder().decode(uint8Array)
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    // 文件上传
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return Response.json({ 
          success: false, 
          message: '请上传文件（支持 .txt / .pdf / .docx）' 
        })
      }

      const text = await parseFile(file)
      if (!text.trim()) {
        return Response.json({ 
          success: false, 
          message: '文件内容为空，请检查文件是否正确' 
        })
      }

      // 追加到知识库（不是覆盖）
      const count = appendDocument(text)
      return Response.json({ 
        success: true, 
        message: `已导入文件 "${file.name}"，当前知识库共 ${count} 个段落` 
      })
    }

    // JSON 请求（query / reset）
    const body = await req.text()
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (e) {
      return Response.json({ 
        success: false, 
        message: '请求格式错误' 
      })
    }
    
    const { action, query } = parsed

    // 问答
    if (action === 'query') {
      const context = searchDocuments(query)
      
      if (!context) {
        return Response.json({ 
          success: false, 
          message: '知识库中没有相关内容' 
        })
      }

      // 调用 DeepSeek
      const apiKey = process.env.DEEPSEEK_API_KEY

      const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
              content: `你是一个基于知识库的问答助手。请基于以下上下文回答问题。如果上下文不足以回答，请说"根据已有资料无法回答"。\n\n上下文：\n${context}`
            },
            { role: 'user', content: query }
          ]
        })
      })

      const aiData = await aiRes.json()
      const answer = aiData.choices?.[0]?.message?.content || '未获取到回答'

      return Response.json({
        success: true,
        answer
      })
    }

    // 重置
    if (action === 'reset') {
      const { clearDocuments } = await import('@/lib/knowledge-base')
      clearDocuments()
      return Response.json({ success: true, message: '知识库已清空' })
    }

    return Response.json({ success: false, message: '未知操作' })

  } catch (e: any) {
    console.error('RAG API 错误:', e)
    return Response.json({ 
      success: false, 
      message: `服务器错误：${e.message}` 
    })
  }
}