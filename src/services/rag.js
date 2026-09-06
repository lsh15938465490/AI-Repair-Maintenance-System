const CHUNK_SIZE = 700
const CHUNK_OVERLAP = 90
const MAX_CONTEXT_CHARS = 5200
const TOP_K = 8

export function chunkText(text) {
  const clean = String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!clean) return []
  const chunks = []
  const step = Math.max(100, CHUNK_SIZE - CHUNK_OVERLAP)
  for (let i = 0; i < clean.length; i += step) {
    const part = clean.slice(i, i + CHUNK_SIZE).trim()
    if (part.length >= 20) chunks.push(part)
    if (i + CHUNK_SIZE >= clean.length) break
  }
  return chunks
}

function tokenize(text) {
  const source = String(text || '').toLowerCase()
  const tokens = source.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9][a-z0-9._-]{1,}/g) || []
  return tokens.slice(0, 400)
}

function termFreq(tokens) {
  const map = new Map()
  tokens.forEach((token) => map.set(token, (map.get(token) || 0) + 1))
  return map
}

const DOMAIN_QUERY =
  '电路板 维修 故障 排查 型号 原理图 烧毁 短路 断路 焊点 电容 电阻 芯片 丝印 复检 注意事项 工具'

export function retrieveChunks(documents, extraQuery = '') {
  const enabled = (documents || []).filter((doc) => doc.enabled !== false && doc.chunks?.length)
  if (!enabled.length) return []

  const queryTokens = tokenize(`${DOMAIN_QUERY} ${extraQuery}`)
  const queryFreq = termFreq(queryTokens)
  const scored = []

  enabled.forEach((doc) => {
    doc.chunks.forEach((chunk, index) => {
      const text = typeof chunk === 'string' ? chunk : chunk.text
      if (!text) return
      const tf = termFreq(tokenize(text))
      let score = 0
      queryFreq.forEach((qCount, term) => {
        const cCount = tf.get(term)
        if (cCount) score += qCount * (1 + Math.log(1 + cCount))
      })
      if (doc.name) score += 0.2
      scored.push({
        score,
        text,
        name: doc.name,
        index
      })
    })
  })

  scored.sort((a, b) => b.score - a.score)
  const picked = []
  let used = 0
  for (const item of scored) {
    if (picked.length >= TOP_K) break
    if (used + item.text.length > MAX_CONTEXT_CHARS) continue
    picked.push(item)
    used += item.text.length
  }

  if (!picked.length) {
    enabled.slice(0, 3).forEach((doc) => {
      const text = typeof doc.chunks[0] === 'string' ? doc.chunks[0] : doc.chunks[0]?.text
      if (text) picked.push({ text, name: doc.name, index: 0, score: 0 })
    })
  }

  return picked
}

export function buildKnowledgeContext(hits) {
  if (!hits?.length) return ''
  const body = hits
    .map((item, i) => `【资料${i + 1}｜${item.name}】\n${item.text}`)
    .join('\n\n')
  return `以下是本地 RAG 知识库检索到的相关资料，请优先参考，并与实拍图交叉验证。若资料与实拍图冲突，以实拍图为准并在结果中说明：\n\n${body}`
}
