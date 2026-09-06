export async function httpGetText(url, headers = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (window.electronAPI?.aiRequest && /^https?:\/\//i.test(url)) {
      const result = await window.electronAPI.aiRequest({ url, method: 'GET', headers })
      if (!result.ok) {
        const msg = result.data?.error?.message || result.error || result.text || `请求失败(${result.status})`
        throw new Error(msg)
      }
      if (typeof result.text === 'string' && result.text) return result.text
      return JSON.stringify(result.data || {})
    }

    const res = await fetch(url, { headers, signal: controller.signal })
    const text = await res.text()
    if (!res.ok) throw new Error(text || `请求失败(${res.status})`)
    return text
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('全网检索超时')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function httpGetJson(url, headers = {}, timeoutMs = 12000) {
  const text = await httpGetText(url, headers, timeoutMs)
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}
