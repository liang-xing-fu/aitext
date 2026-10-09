import { NextRequest } from 'next/server'
import { loadDocument, searchDocuments, clearDocuments, getDocumentCount } from '@/lib/knowledge-base'

export async function GET() {
  return Response.json({
    success: true,
    count: getDocumentCount()
  })
}

export async function POST(req: NextRequest) {
  const { action, text, query } = await req.json()

  switch (action) {
    case 'load':
      const count = loadDocument(text || '')
      return Response.json({ success: true, count })

    case 'search':
      const result = searchDocuments(query || '')
      return Response.json({ success: true, result })

    case 'clear':
      clearDocuments()
      return Response.json({ success: true })

    default:
      return Response.json({ success: false, message: '未知操作' })
  }
}