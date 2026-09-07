const fs = require('fs')
const path = require('path')

const SLOT_FILES = [
  { key: 'front', name: 'front' },
  { key: 'back', name: 'back' },
  { key: 'schematic', name: 'schematic' }
]
const SLOT_RENAME = { 正面: 'front', 反面: 'back', 原理图: 'schematic' }
const LEGACY_SLOT_NAMES = [...Object.keys(SLOT_RENAME), ...SLOT_FILES.map((s) => s.name)]

function getAppParent() {
  if (process.env.APP_DATA_DIR) return process.env.APP_DATA_DIR
  let parent = process.cwd()
  try {
    const electron = require('electron')
    const app = electron.app
    if (app?.isPackaged) {
      parent = path.join(app.getPath('documents'), 'AI电路板辅助维修系统')
    }
  } catch {
    // vite / node
  }
  return parent
}

function isMostlyEmptyDir(dir) {
  if (!fs.existsSync(dir)) return true
  try {
    return fs.readdirSync(dir).every((name) => name === '.gitkeep' || name.startsWith('.'))
  } catch {
    return false
  }
}

function mergeMove(from, to) {
  if (!fs.existsSync(from)) return
  if (!fs.existsSync(to)) {
    try {
      fs.renameSync(from, to)
    } catch {
      fs.cpSync(from, to, { recursive: true })
      fs.rmSync(from, { recursive: true, force: true })
    }
    return
  }
  const fromStat = fs.statSync(from)
  const toStat = fs.statSync(to)
  if (fromStat.isDirectory() && toStat.isDirectory()) {
    for (const name of fs.readdirSync(from)) {
      if (name === '.gitkeep' || name.startsWith('.')) continue
      mergeMove(path.join(from, name), path.join(to, name))
    }
    if (isMostlyEmptyDir(from)) fs.rmSync(from, { recursive: true, force: true })
    return
  }
  if (fromStat.isFile() && toStat.isFile()) {
    fs.rmSync(from, { force: true })
  }
}

function moveDirContents(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true })
  for (const name of fs.readdirSync(fromDir)) {
    if (name === '.gitkeep' || name.startsWith('.')) continue
    mergeMove(path.join(fromDir, name), path.join(toDir, name))
  }
}

function renameLegacySlots(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return
  for (const name of fs.readdirSync(dir)) {
    const child = path.join(dir, name)
    if (fs.statSync(child).isDirectory()) {
      renameLegacySlots(child)
      continue
    }
    const parsed = path.parse(name)
    const nextBase = SLOT_RENAME[parsed.name]
    if (!nextBase) continue
    const dest = path.join(dir, `${nextBase}${parsed.ext}`)
    if (!fs.existsSync(dest)) fs.renameSync(child, dest)
    else fs.unlinkSync(child)
  }
}

function resolveNamedRoot(englishName, legacyNames = []) {
  const parent = getAppParent()
  const next = path.join(parent, englishName)
  fs.mkdirSync(next, { recursive: true })
  for (const name of legacyNames) {
    const legacy = path.join(parent, name)
    if (!fs.existsSync(legacy) || isMostlyEmptyDir(legacy)) continue
    try {
      moveDirContents(legacy, next)
      if (isMostlyEmptyDir(legacy)) {
        fs.rmSync(legacy, { recursive: true, force: true })
      }
    } catch {
      // keep writing to English folder even if leftover Chinese dir remains
    }
  }
  renameLegacySlots(next)
  return next
}

function getMaterialsRoot() {
  if (process.env.MATERIALS_DIR) return process.env.MATERIALS_DIR
  return resolveNamedRoot('materials', ['素材库', '素材'])
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
  for (const file of fs.readdirSync(dir)) {
    const base = path.parse(file).name
    if (LEGACY_SLOT_NAMES.includes(base)) fs.unlinkSync(path.join(dir, file))
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
  getAppParent,
  getMaterialsRoot,
  ensureRoot,
  saveSet,
  updateMeta,
  removeSet,
  info,
  decodeImage,
  mimeToExt,
  safeId
}
