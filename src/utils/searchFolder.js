export const SEARCH_TTL_MS = 30 * 60 * 1000

export async function getSearchFolderInfo() {
  if (window.electronAPI?.searchInfo) return window.electronAPI.searchInfo()
  const res = await fetch('/__search/info')
  if (!res.ok) throw new Error('无法读取查找临时文件夹')
  return res.json()
}

export async function purgeSearchCache() {
  if (window.electronAPI?.searchPurge) return window.electronAPI.searchPurge()
  const res = await fetch('/__search/purge', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || '清理查找缓存失败')
  return data
}

export async function saveSearchHits(items) {
  const payload = { items: items || [] }
  if (window.electronAPI?.searchSave) {
    const result = await window.electronAPI.searchSave(payload)
    if (!result?.ok) throw new Error(result?.error || '写入查找临时文件夹失败')
    return result
  }
  const res = await fetch('/__search/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || '写入查找临时文件夹失败')
  return data
}

async function toDataUrl(src) {
  if (!src) return ''
  if (String(src).startsWith('data:')) return src
  if (String(src).includes('<svg')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`
  }
  try {
    const res = await fetch(src)
    if (!res.ok) return ''
    const blob = await res.blob()
    if (!blob.size) return ''
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

export async function cacheSearchResults(items) {
  const rows = []
  for (const item of (items || []).slice(0, 12)) {
    const image = await toDataUrl(item.thumb || item.url || item.svg || '')
    rows.push({
      id: item.id,
      title: item.title,
      source: item.source,
      pageUrl: item.pageUrl || item.url || '',
      svg: item.svg || '',
      image
    })
  }
  return saveSearchHits(rows)
}
