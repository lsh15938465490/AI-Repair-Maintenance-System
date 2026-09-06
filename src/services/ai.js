import { getProvider } from './providers'
import PCB_REPAIR_SKILL from '@/skills/pcb-repair.md?raw'
import PCB_ANNOTATION_SKILL from '@/skills/pcb-annotation.md?raw'
import PCB_ANNOTATION_REVIEW_SKILL from '@/skills/pcb-annotation-review.md?raw'
import PCB_ICON_SEARCH_SKILL from '@/skills/pcb-icon-search.md?raw'
import { layoutLabelsNoOverlap } from './annotationLayout'

const SYSTEM_PROMPT = PCB_REPAIR_SKILL

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

export async function analyzeBoard({
  providerId,
  apiKey,
  images,
  hasSchematic,
  hasBack = false,
  knowledgeContext = ''
}) {
  const provider = getProvider(providerId)
  const parts = ['已提供电路板正面实拍图。']
  if (hasBack) {
    parts.push('已提供反面实拍图，请判断正反面角度与区域是否对齐。')
  } else {
    parts.push('未提供反面图，跳过正反面对齐检测：alignment.status 填 aligned，detail 写未上传反面图，跳过对齐检测。')
  }
  parts.push(hasSchematic ? '已提供原理图，请综合分析。' : '未提供原理图，请基于实拍图分析。')
  let userText = parts.join('')
  if (knowledgeContext) {
    userText = `${userText}\n\n${knowledgeContext}`
  }

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

const ANNOTATE_PROMPT = PCB_ANNOTATION_SKILL
const REVIEW_PROMPT = PCB_ANNOTATION_REVIEW_SKILL

function chatJson({ provider, apiKey, system, userContent, temperature = 0.15 }) {
  return sendRequest({
    url: `${provider.baseUrl}${provider.chatPath}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: {
      model: provider.model,
      temperature,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    }
  }).then((data) => {
    const content = data?.choices?.[0]?.message?.content
    return extractJson(typeof content === 'string' ? content : JSON.stringify(content || {}))
  })
}

function labelPoint(item) {
  return {
    text: String(item.text || ''),
    targetX: Number(item.targetX ?? item.tx ?? 0),
    targetY: Number(item.targetY ?? item.ty ?? 0)
  }
}

function near(a, b, dist = 0.035) {
  const pa = labelPoint(a)
  const pb = labelPoint(b)
  return Math.hypot(pa.targetX - pb.targetX, pa.targetY - pb.targetY) < dist
}

export function applyLabelCorrections(labels, corrections) {
  const next = (labels || []).map((item) => ({ ...item }))
  ;(corrections || []).forEach((fix) => {
    if (!fix) return
    const hit = next.find(
      (item) => item.text === fix.fromText || item.text === fix.text
    )
    if (!hit) return
    if (fix.text) hit.text = fix.text
    if (fix.targetX != null) hit.targetX = Number(fix.targetX)
    if (fix.targetY != null) hit.targetY = Number(fix.targetY)
    if (fix.textColor) hit.textColor = fix.textColor
    if (fix.lineColor) hit.lineColor = fix.lineColor
  })
  return next
}

export function mergeAnnotationLabels(base, extra) {
  const result = [...(base || [])]
  ;(extra || []).forEach((item) => {
    if (!item?.text) return
    const dup = result.some((old) => near(old, item) || (old.text === item.text && near(old, item, 0.08)))
    if (!dup) result.push(item)
  })
  return result
}

export async function annotateComponents({ providerId, apiKey, images, knowledgeContext = '' }) {
  const provider = getProvider(providerId)
  let userText =
    '请基于第一张电路板正面实拍图，把能看到的全部元器件逐一标注。后续图片若有反面或原理图，仅作辅助理解，标注坐标必须对应第一张正面图。'
  if (knowledgeContext) userText += `\n\n${knowledgeContext}`
  const parsed = await chatJson({
    provider,
    apiKey,
    system: ANNOTATE_PROMPT,
    userContent: buildVisionContent(userText, images)
  })
  if (!parsed?.labels?.length) {
    throw new Error('模型未返回可解析的元件标注，请更换视觉模型后重试')
  }
  return parsed
}

export async function reviewComponentLabels({ providerId, apiKey, images, existingLabels }) {
  const provider = getProvider(providerId)
  const brief = (existingLabels || [])
    .map((item, i) => `${i + 1}.${item.text}@(${Number(item.targetX).toFixed(2)},${Number(item.targetY).toFixed(2)})`)
    .join('；')
  const userText = `请复查：是否标注完成、文字是否准确、箭头是否指在对应元件中心。当前 ${existingLabels?.length || 0} 条：${brief || '无'}。`
  const parsed = await chatJson({
    provider,
    apiKey,
    system: REVIEW_PROMPT,
    userContent: buildVisionContent(userText, images),
    temperature: 0.1
  })
  return {
    complete: Boolean(parsed?.complete) && !(parsed?.missing || []).length,
    accurate: parsed?.accurate !== false && !(parsed?.corrections || []).length,
    missing: parsed?.missing || [],
    corrections: parsed?.corrections || [],
    missedNames: parsed?.missedNames || []
  }
}

export async function annotateComponentsUntilComplete({
  providerId,
  apiKey,
  images,
  knowledgeContext = '',
  maxRounds = 4,
  onProgress
} = {}) {
  onProgress?.('正在识别并标注全部元器件…')
  const first = await annotateComponents({ providerId, apiKey, images, knowledgeContext })
  let labels = layoutLabelsNoOverlap(first.labels || [])
  let title = first.title || '一张图看懂电路板'
  let dividerY = typeof first.dividerY === 'number' ? first.dividerY : null
  let complete = false
  let rounds = 0

  for (let round = 1; round <= maxRounds; round += 1) {
    rounds = round
    onProgress?.(`第 ${round} 次复查：完成度、文字与位置（当前 ${labels.length} 项）…`)
    const review = await reviewComponentLabels({
      providerId,
      apiKey,
      images,
      existingLabels: labels
    })
    const snapshot = JSON.stringify(labels.map((item) => [item.text, item.targetX, item.targetY]))
    labels = layoutLabelsNoOverlap(
      mergeAnnotationLabels(applyLabelCorrections(labels, review.corrections), review.missing)
    )
    const unchanged = snapshot === JSON.stringify(labels.map((item) => [item.text, item.targetX, item.targetY]))
    if (review.complete && review.accurate) {
      complete = true
      onProgress?.(`复查通过：已完成且位置已校正，共 ${labels.length} 项`)
      break
    }
    if (unchanged) {
      complete = review.complete && review.accurate
      onProgress?.(`复查结束，共 ${labels.length} 项${complete ? '' : '，请再人工核对箭头位置'}`)
      break
    }
    onProgress?.(`已根据复查补标/纠偏，继续下一轮…`)
  }

  labels = layoutLabelsNoOverlap(labels)
  return { title, dividerY, labels, complete, rounds }
}

export async function planOrGenerateBoardIcon({
  providerId,
  apiKey,
  mode,
  categoryName,
  productName,
  brand,
  extra
}) {
  const provider = getProvider(providerId)
  const brandText = brand && brand !== '__all__' ? brand : '不限定品牌'
  const userText = `模式：${mode === 'generate' ? 'generate' : 'search'}。品类：${categoryName}。产品：${productName}。品牌场景：${brandText}。补充：${extra || '无'}。请遵守合法开源与原创教学图规则。`
  const parsed = await chatJson({
    provider,
    apiKey,
    system: PCB_ICON_SEARCH_SKILL,
    userContent: userText,
    temperature: mode === 'generate' ? 0.4 : 0.2
  })
  if (!parsed || parsed.blocked) {
    throw new Error(parsed?.reason || '该请求被安全规则拦截')
  }
  return parsed
}
