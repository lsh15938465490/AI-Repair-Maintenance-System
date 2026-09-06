const fs = require('fs')
const path = require('path')

const SLOT_FILES = [
  { key: 'front', name: '正面' },
  { key: 'back', name: '反面' },
  { key: 'schematic', name: '原理图' }
]

function getMaterialsRoot() {
  if (process.env.MATERIALS_DIR) return process.env.MATERIALS_DIR
  try {
    const electron = require('electron')
    const app = electron.app
    if (app?.isPackaged) {
      return path.join(app.getPath('documents'), 'AI电路板辅助维修系统', '素材')
    }
  } catch {
    // vite / node
  }
  return path.join(process.cwd(), '素材')
}

function ensureRoot() {
  const root = getMaterialsRoot()
  fs.mkdirSync(root, { recursive: true })
  return root
}

function safeId(id) {
  const next = String(id || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  if (!next || next === '.' || next === '..') {
    throw new Error('无效的素材 ID')
  }
  return next
}

function itemDir(id) {
  return path.join(ensureRoot(), safeId(id))
}

function mimeToExt(mime, src) {
  const type = String(mime || '').toLowerCase()
  if (type.includes('png')) return '.png'
  if (type.includes('webp')) return '.webp'
  if (type.includes('gif')) return '.gif'
  if (type.includes('svg')) return '.svg'
  if (type.includes('bmp')) return '.bmp'
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg'
  const head = String(src || '').slice(0, 80).toLowerCase()
  if (head.includes('image/png')) return '.png'
  if (head.includes('image/webp')) return '.webp'
  if (head.includes('image/svg')) return '.svg'
  return '.jpg'
}

function decodeImage(src) {
  if (!src) return null
  const text = String(src)
  const match = text.match(/^data:([^;,]+)?((?:;[^,]+)*)?,(.*)$/s)
  if (!match) return null
  const mime = match[1] || 'image/jpeg'
  const extra = match[2] || ''
  const payload = match[3] || ''
  const buffer = extra.includes('base64')
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')
  if (!buffer.length) return null
  return { buffer, ext: mimeToExt(mime, text) }
}

function writeMeta(dir, payload) {
  const meta = {
    id: payload.id,
    title: payload.title || '',
    categoryId: payload.categoryId || '',
    productId: payload.productId || '',
    brand: payload.brand || '',
    extra: payload.extra || '',
    note: payload.note || '',
    source: payload.source || '',
    createdAt: payload.createdAt || Date.now()
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
}

function clearSlotImages(dir) {
  const names = SLOT_FILES.map((slot) => slot.name)
  for (const file of fs.readdirSync(dir)) {
    const base = path.parse(file).name
    if (names.includes(base)) fs.unlinkSync(path.join(dir, file))
  }
}

function saveSet(payload) {
  const id = safeId(payload?.id)
  const dir = itemDir(id)
  fs.mkdirSync(dir, { recursive: true })
  clearSlotImages(dir)
  const saved = []
  for (const slot of SLOT_FILES) {
    const decoded = decodeImage(payload?.[slot.key])
    if (!decoded) continue
    const fileName = `${slot.name}${decoded.ext}`
    fs.writeFileSync(path.join(dir, fileName), decoded.buffer)
    saved.push(fileName)
  }
  writeMeta(dir, { ...payload, id })
  return { ok: true, root: getMaterialsRoot(), dir, files: saved }
}

function updateMeta(payload) {
  const dir = itemDir(payload?.id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  writeMeta(dir, payload)
  return { ok: true, root: getMaterialsRoot(), dir }
}

function removeSet(id) {
  const dir = itemDir(id)
  fs.rmSync(dir, { recursive: true, force: true })
  return { ok: true, root: getMaterialsRoot() }
}

function info() {
  const root = ensureRoot()
  return { ok: true, root }
}

module.exports = {
  getMaterialsRoot,
  ensureRoot,
  saveSet,
  updateMeta,
  removeSet,
  info
}
