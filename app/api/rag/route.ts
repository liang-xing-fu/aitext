export const dynamic = 'force-dynamic'  // 加这一行
import { NextRequest } from 'next/server'
import { loadDocument, getDocumentCount } from '@/lib/knowledge-base'

// 内存向量存储（跟 RAG 共用）
let documents: { text: string; embedding: number[] }[] = []

function simpleEmbed(text: string): number[] {
  const words = text.toLowerCase().split(/[\s,，。！？、；：""''（）()【】《》\n\r]+/)
  const wordSet = new Set(words.filter(w => w.length > 0))
  return Array.from(wordSet).map(w => {
    let hash = 0
    for (let i = 0; i < w.length; i++) {
      hash = ((hash << 5) - hash) + w.charCodeAt(i)
      hash |= 0
    }
    return hash / 2147483647
  })
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    dotProduct += (a[i] || 0) * (b[i] || 0)
    normA += (a[i] || 0) * (a[i] || 0)
    normB += (b[i] || 0) * (b[i] || 0)
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

function chunkText(text: string, chunkSize = 200): string[] {
  const sentences = text.split(/[。！？\n]/)
  const chunks: string[] = []
  let current = ''
  
  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence + '。'
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks.filter(c => c.length > 10)  // 过滤太短的块
}

// 解析不同格式的文件
async function parseFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  console.log('文件大小:', bytes.byteLength, '字节')  // 加这行
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
    console.log('收到请求，Content-Type:', contentType)

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
      console.log('解析完成，文本长度:', text.length)

      if (!text.trim()) {
        return Response.json({ 
          success: false, 
          message: '文件内容为空，请检查文件是否正确' 
        })
      }

      const chunks = chunkText(text)
      documents = chunks.map(chunk => ({
        text: chunk,
        embedding: simpleEmbed(chunk)
      }))
      const count = loadDocument(text)
      return Response.json({ 
        success: true, 
        message: `已加载文件 "${file.name}"，${count} 个文本块` 
      })
    }

    // JSON 请求（query / reset）
    const body = await req.text()  // 先拿原始文本
    console.log('JSON 请求体:', body)
    
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (e) {
      return Response.json({ 
        success: false, 
        message: '请求格式错误：' + body 
      })
    }
    
    const { action, query } = parsed
    console.log('action:', action, 'query:', query)

    // 问答
    if (action === 'query') {
      if (documents.length === 0) {
        return Response.json({ 
          success: false, 
          message: '请先上传文档' 
        })
      }

      const queryEmbedding = simpleEmbed(query)
      const results = documents
        .map(doc => ({
          text: doc.text,
          score: cosineSimilarity(queryEmbedding, doc.embedding)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      console.log('检索到', results.length, '个相关段落')

      // 调用 DeepSeek
      const apiKey = process.env.DEEPSEEK_API_KEY
      const context = results.map(r => r.text).join('\n\n')

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
        answer,
        sources: results.map(r => ({ text: r.text.slice(0, 100), score: r.score.toFixed(3) }))
      })
    }

    // 重置
    if (action === 'reset') {
      documents = []
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