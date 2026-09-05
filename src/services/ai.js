import { getProvider } from './providers'

const SYSTEM_PROMPT = `你是资深电路板维修工程师。请根据用户提供的电路板正面实拍图、反面实拍图，以及可选的电路原理图，完成以下分析，并严格只返回 JSON（不要 Markdown）：
{
  "alignment": { "status": "aligned" 或 "misaligned", "detail": "正反面角度/摆放/裁切对齐判断说明" },
  "modelNumber": "识别到的电路板完整型号，识别不到则写未识别到明确型号",
  "faults": [
    { "location": "故障点位", "type": "故障类型", "reason": "故障原因解析" }
  ],
  "repairSteps": [
    { "title": "步骤标题", "content": "该步骤的详细操作说明" }
  ]
}
要求：
1. 判断正反面拍摄角度、摆放方向、裁切范围是否统一对齐，如有偏移、倾斜、视角偏差需明确说明。
2. 尽量读取丝印、编码、标识文字提取型号。
3. 排查烧毁、断路、短路、焊点脱落、电容电阻损坏等常见故障。
4. 维修步骤必须覆盖：故障原因分析、工具准备、拆解排查、修复操作、复检校验、注意事项。
5. 语言使用简体中文，步骤通俗、可实操。`

function extractJson(text) {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

async function sendRequest({ url, headers, body }) {
  if (window.electronAPI?.aiRequest) {
    const result = await window.electronAPI.aiRequest({ url, method: 'POST', headers, body })
    if (!result.ok) {
      const msg = result.data?.error?.message || result.error || result.text || `请求失败(${result.status})`
      throw new Error(msg)
    }
    return result.data
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || text || `请求失败(${res.status})`)
  }
  return data
}

function buildVisionContent(prompt, images) {
  return [
    { type: 'text', text: prompt },
    ...images.map((url) => ({
      type: 'image_url',
      image_url: { url }
    }))
  ]
}

export async function analyzeBoard({ providerId, apiKey, images, hasSchematic }) {
  const provider = getProvider(providerId)
  const userText = hasSchematic
    ? '已提供电路板正面图、反面图和原理图，请综合分析。'
    : '仅提供电路板正面图和反面图，未提供原理图，请基于实拍图分析。'

  const body = {
    model: provider.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildVisionContent(userText, images)
      }
    ]
  }

  const data = await sendRequest({
    url: `${provider.baseUrl}${provider.chatPath}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body
  })

  const content = data?.choices?.[0]?.message?.content
  const parsed = extractJson(typeof content === 'string' ? content : JSON.stringify(content || {}))
  if (!parsed) {
    throw new Error('模型未返回可解析的识别结果，请更换视觉模型后重试')
  }
  return parsed
}

export async function testConnection({ providerId, apiKey }) {
  const provider = getProvider(providerId)
  const data = await sendRequest({
    url: `${provider.baseUrl}${provider.chatPath}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: {
      model: provider.model,
      messages: [{ role: 'user', content: '请只回复：连通成功' }],
      max_tokens: 16,
      temperature: 0
    }
  })
  const content = data?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : JSON.stringify(content || data)
}
