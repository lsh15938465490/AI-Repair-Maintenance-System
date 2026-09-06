export function isAllowedImage(file) {
  const type = (file?.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  const name = (file?.name || '').toLowerCase()
  return /\.(jpe?g|png|gif|webp|bmp|svg|tiff?|avif|heic|heif|ico|jfif|apng|pjp)$/i.test(name)
}

export function isAllowedSchematic(file) {
  const name = (file?.name || '').toLowerCase()
  const type = (file?.type || '').toLowerCase()
  return isAllowedImage(file) || type === 'application/pdf' || name.endsWith('.pdf')
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export async function compressImage(dataUrl, maxSize = 1600, quality = 0.82) {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解析失败'))
    img.src = src
  })
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export async function pdfToImageDataUrl(file) {
  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1.6 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.82)
}

export function isKnowledgeFile(file) {
  const name = (file?.name || '').toLowerCase()
  const type = (file?.type || '').toLowerCase()
  return (
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.csv') ||
    name.endsWith('.json') ||
    name.endsWith('.pdf') ||
    name.endsWith('.docx') ||
    type === 'text/plain' ||
    type === 'text/markdown' ||
    type === 'text/csv' ||
    type === 'application/json' ||
    type === 'application/pdf' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

export async function pdfToText(file, maxPages = 40) {
  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  const parts = []
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const line = content.items.map((item) => item.str || '').join(' ')
    if (line.trim()) parts.push(line)
  }
  return parts.join('\n')
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

export async function docxToText(file) {
  const mod = await import('mammoth')
  const mammoth = mod.default || mod
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return String(result.value || '').trim()
}

export async function extractKnowledgeText(file) {
  const name = (file?.name || '').toLowerCase()
  const type = (file?.type || '').toLowerCase()
  if (name.endsWith('.pdf') || type === 'application/pdf') {
    return pdfToText(file)
  }
  if (
    name.endsWith('.docx') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return docxToText(file)
  }
  return readTextFile(file)
}
