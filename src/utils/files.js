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

export function isKnowledgeFile() {
  return true
}

function isTextLikeFile(file) {
  const name = (file?.name || '').toLowerCase()
  const type = (file?.type || '').toLowerCase()
  if (type.startsWith('text/') || type === 'application/json' || type === 'application/xml') return true
  return /\.(txt|md|csv|json|xml|html|htm|log|yml|yaml|ini|cfg|js|ts|css|svg)$/i.test(name)
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

export async function docBinaryToText(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const parts = []
  let run = ''
  const flush = () => {
    if (run.trim().length >= 6) parts.push(run.trim())
    run = ''
  }
  const view = new DataView(buffer)
  const even = bytes.byteLength - (bytes.byteLength % 2)
  for (let i = 0; i < even; i += 2) {
    const c = view.getUint16(i, true)
    if (c >= 0x20 && c < 0xfffe && c !== 0xfeff) run += String.fromCharCode(c)
    else flush()
  }
  flush()
  const unicode = parts.join('\n')
  if (unicode.replace(/\s/g, '').length > 40) return unicode
  parts.length = 0
  run = ''
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) run += String.fromCharCode(b)
    else flush()
  }
  flush()
  return parts.join('\n')
}

export async function extractKnowledgeText(file) {
  const name = (file?.name || '').toLowerCase()
  const type = (file?.type || '').toLowerCase()
  try {
    if (name.endsWith('.pdf') || type === 'application/pdf') {
      return await pdfToText(file)
    }
    if (
      name.endsWith('.docx') ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return await docxToText(file)
    }
    if (name.endsWith('.doc') || type === 'application/msword') {
      try {
        return await docxToText(file)
      } catch {
        return await docBinaryToText(file)
      }
    }
    if (isTextLikeFile(file)) {
      return await readTextFile(file)
    }
    return ''
  } catch {
    return ''
  }
}
