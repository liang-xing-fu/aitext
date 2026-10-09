// 共享知识库模块
interface DocumentChunk {
  text: string
  embedding: Map<string, number>
}

class KnowledgeBase {
  private documents: DocumentChunk[] = []

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,，。！？、；：""''（）()【】《》\n\r]+/)
      .filter(w => w.length > 0)
  }

  private embed(text: string): Map<string, number> {
    const vec = new Map<string, number>()
    for (const w of this.tokenize(text)) {
      vec.set(w, (vec.get(w) ?? 0) + 1)
    }
    return vec
  }

  private cosine(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0, na = 0, nb = 0
    for (const [k, v] of a) {
      na += v * v
      if (b.has(k)) dot += v * (b.get(k) as number)
    }
    for (const [, v] of b) nb += v * v
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
  }
  private similarity(query: string, doc: string): number {
    const q = query.toLowerCase()
    const d = doc.toLowerCase()
    
    // 1. 精确子串匹配：查询词出现在文档中
    if (d.includes(q)) {
      return 1.0
    }
    
    // 2. 词重叠匹配
    const qWords = this.tokenize(query)
    const dWords = this.tokenize(doc)
    
    if (qWords.length === 0 || dWords.length === 0) return 0
    
    // 计算有多少查询词出现在了文档词中
    let matchCount = 0
    for (const qw of qWords) {
      if (dWords.some(dw => dw.includes(qw) || qw.includes(dw))) {
        matchCount++
      }
    }
    
    return matchCount / qWords.length
  }
  private chunkText(text: string): string[] {
    return text
      .split(/\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
  }

  loadDocument(text: string) {
    const chunks = this.chunkText(text)
    this.documents = chunks.map(chunk => ({
      text: chunk,
      embedding: this.embed(chunk)
    }))
    return this.documents.length
  }

  appendDocument(text: string) {
    const chunks = this.chunkText(text)
    const newDocs = chunks.map(chunk => ({
      text: chunk,
      embedding: this.embed(chunk)
    }))
    this.documents.push(...newDocs)
    return this.documents.length
  }

  searchDocuments(query: string, topK = 3): string {
    if (this.documents.length === 0) return ''
    
    const results = this.documents
      .map(doc => ({
        text: doc.text,
        score: this.similarity(query, doc.text)
      }))
      .sort((a, b) => b.score - a.score)
      .filter(r => r.score > 0)
      .slice(0, topK)

    if (results.length === 0) return ''
    return results.map(r => r.text).join('\n---\n')
  }

  clearDocuments() {
    this.documents = []
  }

  getDocumentCount() {
    return this.documents.length
  }
}

const kb = new KnowledgeBase()

export function loadDocument(text: string) {
  return kb.loadDocument(text)
}

export function appendDocument(text: string) {
  return kb.appendDocument(text)
}

export function searchDocuments(query: string, topK?: number) {
  return kb.searchDocuments(query, topK)
}

export function clearDocuments() {
  kb.clearDocuments()
}

export function getDocumentCount() {
  return kb.getDocumentCount()
}