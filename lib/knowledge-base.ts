// 共享知识库模块
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
  return chunks.filter(c => c.length > 10)
}

export function loadDocument(text: string) {
  const chunks = chunkText(text)
  documents = chunks.map(chunk => ({
    text: chunk,
    embedding: simpleEmbed(chunk)
  }))
  return documents.length
}

export function searchDocuments(query: string, topK = 3): string {
  if (documents.length === 0) return ''
  
  const queryEmbedding = simpleEmbed(query)
  const results = documents
    .map(doc => ({
      text: doc.text,
      score: cosineSimilarity(queryEmbedding, doc.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return results.map(r => r.text).join('\n---\n')
}

export function clearDocuments() {
  documents = []
}

export function getDocumentCount() {
  return documents.length
}