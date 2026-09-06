/**
 * 密钥默认展示：前 8 位明文 + 中间 * + 后 4 位明文。
 * 长度不足时全部用 *，避免短密钥被直接露出。
 */
export function maskApiKey(key) {
  const text = String(key || '')
  if (!text) return ''
  if (text.length <= 12) return '*'.repeat(text.length)
  return `${text.slice(0, 8)}${'*'.repeat(text.length - 12)}${text.slice(-4)}`
}
