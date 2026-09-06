import { ALL_BRAND_VALUE, getProduct } from '@/data/pcbIconCatalog'
import { buildTeachingSvg } from '@/data/teachingBoardSvgs'
import { httpGetText } from '@/utils/http'

const BLOCK_TEXT = /破解|盗版|泄密|机密内部|成人|色情|赌博|枪支|毒品|侵权仿冒|高仿|黄片/i
const BROWSER_HEADERS = {
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8'
}

function candidateUrls(kind, pathAndQuery) {
  if (kind === 'baidu') {
    const remote = `https://image.baidu.com${pathAndQuery}`
    return import.meta.env.DEV ? [`/web-img/baidu${pathAndQuery}`, remote] : [remote]
  }
  const remote = `https://www.bing.com${pathAndQuery}`
  return import.meta.env.DEV ? [`/web-img/bing${pathAndQuery}`, remote] : [remote]
}

async function getTextWithFallback(urls) {
  let lastError = null
  for (const url of urls) {
    try {
      return await httpGetText(url, BROWSER_HEADERS)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('全网检索失败')
}

function decodeEscaped(value) {
  return String(value || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
}

function isImageUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false
  if (BLOCK_TEXT.test(url)) return false
  return true
}

function isSafeRecord(title, extra = '') {
  return !BLOCK_TEXT.test(`${title} ${extra}`)
}

export function buildSearchText({ categoryId, productId, brand, extra = '' }) {
  const product = getProduct(categoryId, productId)
  const brandText = brand && brand !== ALL_BRAND_VALUE ? brand : ''
  const extraText = String(extra || '').trim()
  const zh = [brandText, product.name, extraText || product.queryZh, '实拍'].filter(Boolean).join(' ')
  const en = [brandText, product.queryEn, extraText].filter(Boolean).join(' ')
  return { zh, en, product }
}

function uniqueByUrl(list) {
  const seen = new Set()
  return list.filter((item) => {
    const key = item.url || item.thumb || item.id
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectByRegex(text, pattern) {
  const hits = []
  const re = new RegExp(pattern, 'g')
  let match = re.exec(text)
  while (match) {
    hits.push(decodeEscaped(match[1]))
    match = re.exec(text)
  }
  return hits
}

function parseBaidu(text) {
  let rows = []
  try {
    const parsed = JSON.parse(text)
    rows = parsed?.data || []
  } catch {
    rows = []
  }
  const mapped = rows
    .map((item, index) => {
      const thumb = decodeEscaped(item.thumbURL || item.middleURL || item.hoverURL || '')
      const url = decodeEscaped(item.middleURL || item.hoverURL || item.thumbURL || '')
      const title = decodeEscaped(item.fromPageTitleEnc || item.fromPageTitle || item.objURL || '电路板图片')
      const pageUrl = decodeEscaped(item.fromURL || '')
      if (!isImageUrl(thumb) || !isSafeRecord(title, pageUrl)) return null
      return {
        id: `baidu-${index}-${thumb.slice(-24)}`,
        source: '全网检索',
        title: title.replace(/<[^>]+>/g, '').slice(0, 80) || '电路板图片',
        thumb,
        url,
        pageUrl: pageUrl || url,
        creator: decodeEscaped(item.fromURLHost || '公开网页'),
        license: '网页公开索引，请自行核权'
      }
    })
    .filter(Boolean)

  if (mapped.length) return mapped

  const thumbs = collectByRegex(text, '"thumbURL":"(https?:[^"]+)"')
  return thumbs.slice(0, 30).map((thumb, index) => {
    if (!isImageUrl(thumb)) return null
    return {
      id: `baidu-re-${index}`,
      source: '全网检索',
      title: '电路板图片',
      thumb,
      url: thumb,
      pageUrl: thumb,
      creator: '公开网页',
      license: '网页公开索引，请自行核权'
    }
  }).filter(Boolean)
}

function parseBing(html) {
  const murls = collectByRegex(html, '"murl":"([^"]+)"')
  const turls = collectByRegex(html, '"turl":"([^"]+)"')
  const purls = collectByRegex(html, '"purl":"([^"]+)"')
  const titles = collectByRegex(html, '"t":"([^"]+)"')
  return murls.slice(0, 30).map((url, index) => {
    const thumb = turls[index] || url
    const title = titles[index] || '电路板图片'
    const pageUrl = purls[index] || url
    if (!isImageUrl(url) || !isSafeRecord(title, pageUrl)) return null
    return {
      id: `bing-${index}-${url.slice(-24)}`,
      source: '全网检索',
      title: decodeEscaped(title).replace(/<[^>]+>/g, '').slice(0, 80),
      thumb: decodeEscaped(thumb),
      url: decodeEscaped(url),
      pageUrl: decodeEscaped(pageUrl),
      creator: '公开网页',
      license: '网页公开索引，请自行核权'
    }
  }).filter(Boolean)
}

async function searchBaidu(query) {
  const qs = new URLSearchParams({
    tn: 'resultjson_com',
    ipn: 'rj',
    ct: '201326592',
    fp: 'result',
    queryWord: query,
    word: query,
    ie: 'utf-8',
    oe: 'utf-8',
    pn: '0',
    rn: '30',
    st: '-1'
  })
  const text = await getTextWithFallback(candidateUrls('baidu', `/search/acjson?${qs}`))
  return parseBaidu(text)
}

async function searchBing(query) {
  const qs = new URLSearchParams({
    q: query,
    first: '1',
    count: '35',
    form: 'HDRSC2'
  })
  const text = await getTextWithFallback(candidateUrls('bing', `/images/search?${qs}`))
  return parseBing(text)
}

export async function searchLegalBoardImages({ categoryId, productId, brand, extra, extraQueries = [] }) {
  const { zh, en, product } = buildSearchText({ categoryId, productId, brand, extra })
  const queries = [zh, extra, ...extraQueries, en].map((q) => String(q || '').trim()).filter(Boolean)
  const uniqQueries = [...new Set(queries)].slice(0, 2)
  const batches = await Promise.allSettled(
    uniqQueries.flatMap((q) => [searchBaidu(q), searchBing(q)])
  )
  const merged = []
  batches.forEach((item) => {
    if (item.status === 'fulfilled') merged.push(...item.value)
  })
  const list = uniqueByUrl(merged).slice(0, 24)
  if (list.length) return list

  const svg = buildTeachingSvg({ productName: product.name, brand, extra })
  return [
    {
      id: 'local-teaching',
      source: '本机原创教学图（全网检索暂无结果时回退）',
      title: `${product.name}教学控制板示意图`,
      creator: '系统内置拓扑',
      license: '原创教学图（非原厂资料）',
      svg,
      thumb: svgToDataUrl(svg)
    }
  ]
}

export function sanitizeSvg(raw) {
  const text = String(raw || '')
  const start = text.indexOf('<svg')
  const end = text.lastIndexOf('</svg>')
  if (start < 0 || end < start) {
    throw new Error('模型未返回可用的 SVG 图标')
  }
  let svg = text.slice(start, end + 6)
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '')
  svg = svg.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
  svg = svg.replace(/javascript:/gi, '')
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  return svg
}

export function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
