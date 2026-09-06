import { defineStore } from 'pinia'
import { deleteMaterial, listMaterials, saveMaterial } from '@/utils/idb'
import { svgToDataUrl } from '@/services/iconSearch'
import {
  getMaterialsFolderInfo,
  removeMaterialFromFolder,
  saveMaterialToFolder,
  updateMaterialFolderMeta
} from '@/utils/materialFolder'

export function makeMaterialId(time = Date.now()) {
  const d = new Date(time)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`
}

export function coverSrc(item) {
  if (!item) return ''
  if (item.front) return item.front
  if (item.back) return item.back
  if (item.schematic) return item.schematic
  if (item.svg) return svgToDataUrl(item.svg)
  return item.thumb || item.url || ''
}

export function normalizeMaterial(row) {
  const cover = row.front || row.thumb || row.url || (row.svg ? svgToDataUrl(row.svg) : '')
  const hasSlot = Boolean(row.front || row.back || row.schematic)
  return {
    ...row,
    front: hasSlot ? row.front || '' : cover || '',
    back: row.back || '',
    schematic: row.schematic || ''
  }
}

function fingerprint(item) {
  return item.pageUrl || item.front || item.url || item.thumb || item.title || ''
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function persistSrc(src) {
  if (!src) return ''
  if (String(src).startsWith('data:')) return src
  try {
    const res = await fetch(src)
    if (!res.ok) return src
    const blob = await res.blob()
    if (!blob.size) return src
    return await blobToDataUrl(blob)
  } catch {
    return src
  }
}

async function persistThumb(item) {
  if (item.svg) {
    return { ...item, thumb: item.thumb || svgToDataUrl(item.svg) }
  }
  const src = await persistSrc(item.thumb || item.url)
  return { ...item, thumb: src }
}

function baseRow(meta, extra = {}) {
  const createdAt = Date.now()
  return {
    id: makeMaterialId(createdAt),
    title: extra.title || '未命名素材',
    source: extra.source || '',
    license: extra.license || '',
    creator: extra.creator || '',
    pageUrl: extra.pageUrl || '',
    url: extra.url || '',
    thumb: extra.thumb || extra.front || '',
    svg: extra.svg || '',
    front: extra.front || '',
    back: extra.back || '',
    schematic: extra.schematic || '',
    categoryId: meta.categoryId,
    productId: meta.productId,
    brand: meta.brand,
    extra: meta.extra || '',
    note: extra.note || '',
    createdAt,
    folder: '素材'
  }
}

function folderPayload(row) {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.categoryId,
    productId: row.productId,
    brand: row.brand,
    extra: row.extra,
    note: row.note,
    source: row.source,
    createdAt: row.createdAt,
    front: row.front,
    back: row.back,
    schematic: row.schematic
  }
}

export const useMaterialsStore = defineStore('materials', {
  state: () => ({
    items: [],
    loaded: false,
    folderPath: ''
  }),
  getters: {
    count: (state) => state.items.length
  },
  actions: {
    async load() {
      const rows = await listMaterials()
      this.items = (rows || []).map(normalizeMaterial)
      this.loaded = true
      try {
        const info = await getMaterialsFolderInfo()
        this.folderPath = info.root || ''
      } catch {
        this.folderPath = ''
      }
    },
    isSaved(item) {
      const key = fingerprint(item)
      return this.items.some((row) => fingerprint(normalizeMaterial(row)) === key)
    },
    async addFromSearch(item, meta) {
      if (this.isSaved(item)) return { duplicated: true }
      const persisted = await persistThumb(item)
      const front = persisted.thumb || persisted.url || ''
      const row = baseRow(meta, {
        title: persisted.title || '未命名素材',
        source: persisted.source || '',
        license: persisted.license || '',
        creator: persisted.creator || '',
        pageUrl: persisted.pageUrl || '',
        url: persisted.url || '',
        thumb: front,
        svg: persisted.svg || '',
        front
      })
      await saveMaterialToFolder(folderPayload(row))
      await saveMaterial(row)
      await this.load()
      return { duplicated: false }
    },
    async addBoardSet({ title, front, back, schematic, meta }) {
      const nextFront = await persistSrc(front)
      const nextBack = await persistSrc(back)
      const nextSchematic = await persistSrc(schematic)
      if (!nextFront && !nextBack && !nextSchematic) {
        throw new Error('没有可保存的图片')
      }
      const dup = this.items.some(
        (row) => row.front === nextFront && row.back === nextBack && row.schematic === nextSchematic
      )
      if (dup) return { duplicated: true }
      const row = baseRow(meta, {
        title: title || '维修识别素材',
        source: '维修识别上传',
        license: '本机上传',
        creator: '用户',
        thumb: nextFront || nextBack || nextSchematic,
        front: nextFront,
        back: nextBack,
        schematic: nextSchematic
      })
      await saveMaterialToFolder(folderPayload(row))
      await saveMaterial(row)
      await this.load()
      return { duplicated: false }
    },
    async update(row) {
      const next = normalizeMaterial(row)
      await saveMaterial(next)
      await updateMaterialFolderMeta(folderPayload(next))
      await this.load()
    },
    async moveImageSlot(id, fromKey, toKey) {
      const keys = ['front', 'back', 'schematic']
      if (!keys.includes(fromKey) || !keys.includes(toKey) || fromKey === toKey) return
      const row = this.items.find((item) => item.id === id)
      if (!row || !row[fromKey]) return
      const next = {
        ...row,
        [fromKey]: row[toKey] || '',
        [toKey]: row[fromKey]
      }
      next.thumb = next.front || next.back || next.schematic || next.thumb
      await saveMaterialToFolder(folderPayload(next))
      await saveMaterial(next)
      await this.load()
    },
    async remove(id) {
      await deleteMaterial(id)
      await removeMaterialFromFolder(id)
      await this.load()
    }
  }
})
