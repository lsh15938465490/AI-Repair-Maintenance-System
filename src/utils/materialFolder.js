export async function getMaterialsFolderInfo() {
  if (window.electronAPI?.materialsInfo) {
    return window.electronAPI.materialsInfo()
  }
  const res = await fetch('/__materials/info')
  if (!res.ok) throw new Error('无法读取素材文件夹')
  return res.json()
}

export async function saveMaterialToFolder(payload) {
  if (window.electronAPI?.materialsSave) {
    const result = await window.electronAPI.materialsSave(payload)
    if (!result?.ok) throw new Error(result?.error || '写入素材文件夹失败')
    return result
  }
  const res = await fetch('/__materials/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || '写入素材文件夹失败')
  }
  return data
}

export async function updateMaterialFolderMeta(payload) {
  if (window.electronAPI?.materialsMeta) {
    const result = await window.electronAPI.materialsMeta(payload)
    if (!result?.ok) throw new Error(result?.error || '更新素材文件夹失败')
    return result
  }
  const res = await fetch('/__materials/meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || '更新素材文件夹失败')
  }
  return data
}

export async function removeMaterialFromFolder(id) {
  if (window.electronAPI?.materialsRemove) {
    const result = await window.electronAPI.materialsRemove(id)
    if (!result?.ok) throw new Error(result?.error || '删除素材文件夹失败')
    return result
  }
  const res = await fetch('/__materials/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || '删除素材文件夹失败')
  }
  return data
}

export async function openMaterialsFolder() {
  if (window.electronAPI?.materialsOpen) {
    return window.electronAPI.materialsOpen()
  }
  throw new Error('网页模式请直接在资源管理器中打开项目下的「素材」文件夹')
}
