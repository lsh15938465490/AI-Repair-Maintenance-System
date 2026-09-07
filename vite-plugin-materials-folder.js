import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(import.meta.url))
const materialFolder = require('./electron/materialFolder.cjs')
const searchCache = require('./electron/searchCache.cjs')
const pcbAnnotate = require('./electron/pcbAnnotate.cjs')

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function readBody(req, limit = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('文件过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function createMiddleware() {
  return async (req, res, next) => {
    const url = req.url || ''
    try {
      if (url.startsWith('/__materials')) {
        if (req.method === 'GET' && (url === '/__materials/info' || url.startsWith('/__materials/info?'))) {
          return sendJson(res, 200, materialFolder.info())
        }
        if (req.method === 'POST' && url.startsWith('/__materials/save')) {
          const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          return sendJson(res, 200, materialFolder.saveSet(payload))
        }
        if (req.method === 'POST' && url.startsWith('/__materials/meta')) {
          const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          return sendJson(res, 200, materialFolder.updateMeta(payload))
        }
        if (req.method === 'POST' && url.startsWith('/__materials/remove')) {
          const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          return sendJson(res, 200, materialFolder.removeSet(payload.id))
        }
        return sendJson(res, 404, { ok: false, error: '未知素材接口' })
      }
      if (url.startsWith('/__search')) {
        if (req.method === 'GET' && (url === '/__search/info' || url.startsWith('/__search/info?'))) {
          return sendJson(res, 200, searchCache.info())
        }
        if (req.method === 'POST' && url.startsWith('/__search/purge')) {
          return sendJson(res, 200, searchCache.purgeExpired())
        }
        if (req.method === 'POST' && url.startsWith('/__search/save')) {
          const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          return sendJson(res, 200, searchCache.saveHits(payload))
        }
        return sendJson(res, 404, { ok: false, error: '未知查找缓存接口' })
      }
      if (url.startsWith('/__annotate')) {
        if (req.method === 'POST' && url.startsWith('/__annotate')) {
          const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          return sendJson(res, 200, await pcbAnnotate.runAnnotate(payload))
        }
        return sendJson(res, 404, { ok: false, error: '未知标注接口' })
      }
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || '本地文件夹写入失败' })
    }
    return next()
  }
}

export function materialsFolderPlugin() {
  return {
    name: 'local-folders',
    configureServer(server) {
      materialFolder.ensureRoot()
      searchCache.ensureRoot()
      searchCache.purgeExpired()
      const timer = setInterval(() => {
        try {
          searchCache.purgeExpired()
        } catch {
          // ignore
        }
      }, 5 * 60 * 1000)
      timer.unref?.()
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      materialFolder.ensureRoot()
      searchCache.ensureRoot()
      searchCache.purgeExpired()
      server.middlewares.use(createMiddleware())
    }
  }
}
