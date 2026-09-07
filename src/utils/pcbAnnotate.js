export async function runPcbAnnotatePipeline(payload) {
  if (window.electronAPI?.pcbAnnotate) {
    return window.electronAPI.pcbAnnotate(payload)
  }
  const res = await fetch('/__annotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && data.ok !== true) {
    throw new Error(data.error || '标注流水线调用失败')
  }
  return data
}
