const fs = require('fs')
const path = require('path')
const { getAppParent, decodeImage, safeId } = require('./materialFolder.cjs')

const TTL_MS = 30 * 60 * 1000
const FOLDER = 'search'

function getSearchRoot() {
  if (process.env.SEARCH_DIR) return process.env.SEARCH_DIR
  return path.join(getAppParent(), FOLDER)
}

function ensureRoot() {
  const root = getSearchRoot()
  fs.mkdirSync(root, { recursive: true })
  return root
}

function isExpired(createdAt, now = Date.now()) {
  return now - Number(createdAt || 0) > TTL_MS
}

function purgeExpired() {
  const root = ensureRoot()
  const now = Date.now()
  let removed = 0
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith('.')) continue
    const dir = path.join(root, name)
    let createdAt = 0
    try {
      const stat = fs.statSync(dir)
      createdAt = stat.mtimeMs
      if (stat.isDirectory()) {
        const metaPath = path.join(dir, 'meta.json')
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          createdAt = Number(meta.createdAt || meta.expiresAt - TTL_MS || createdAt)
        }
      }
      if (isExpired(createdAt, now)) {
        fs.rmSync(dir, { recursive: true, force: true })
        removed += 1
      }
    } catch {
      // skip
    }
  }
  return { ok: true, root, removed, ttlMs: TTL_MS }
}

function saveHits(payload) {
  purgeExpired()
  const root = ensureRoot()
  const items = Array.isArray(payload?.items) ? payload.items.slice(0, 12) : []
  const saved = []
  const createdAt = Date.now()
  const expiresAt = createdAt + TTL_MS
  for (const item of items) {
    const rawId = String(item.id || `hit-${createdAt}-${saved.length}`)
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80)
    const id = safeId(rawId || `hit-${createdAt}-${saved.length}`)
    const dir = path.join(root, id)
    fs.mkdirSync(dir, { recursive: true })
    const decoded = decodeImage(item.image || item.thumb || item.svg)
    const files = []
    if (decoded) {
      const fileName = `image${decoded.ext}`
      fs.writeFileSync(path.join(dir, fileName), decoded.buffer)
      files.push(fileName)
    } else if (item.svg) {
      fs.writeFileSync(path.join(dir, 'image.svg'), String(item.svg), 'utf8')
      files.push('image.svg')
    }
    const meta = {
      id,
      title: item.title || '',
      source: item.source || '',
      pageUrl: item.pageUrl || item.url || '',
      createdAt,
      expiresAt
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
    saved.push({ id, files, expiresAt })
  }
  return { ok: true, root, saved, ttlMs: TTL_MS, expiresAt }
}

function info() {
  const purged = purgeExpired()
  return { ok: true, root: purged.root, ttlMs: TTL_MS }
}

module.exports = {
  TTL_MS,
  getSearchRoot,
  ensureRoot,
  purgeExpired,
  saveHits,
  info
}
