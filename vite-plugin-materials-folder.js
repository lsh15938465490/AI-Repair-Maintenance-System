import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(import.meta.url))
const materialFolder = require('./electron/materialFolder.cjs')

const PREFIX = '/__materials'

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('素材文件过大'))
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
    if (!url.startsWith(PREFIX)) return next()

    try {
      if (req.method === 'GET' && (url === `${PREFIX}/info` || url.startsWith(`${PREFIX}/info?`))) {
        return sendJson(res, 200, materialFolder.info())
      }
      if (req.method === 'POST' && url.startsWith(`${PREFIX}/save`)) {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        return sendJson(res, 200, materialFolder.saveSet(payload))
      }
      if (req.method === 'POST' && url.startsWith(`${PREFIX}/meta`)) {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        return sendJson(res, 200, materialFolder.updateMeta(payload))
      }
      if (req.method === 'POST' && url.startsWith(`${PREFIX}/remove`)) {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        return sendJson(res, 200, materialFolder.removeSet(payload.id))
      }
      sendJson(res, 404, { ok: false, error: '未知素材接口' })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || '素材文件夹写入失败' })
    }
  }
}

export function materialsFolderPlugin() {
  return {
    name: 'materials-folder',
    configureServer(server) {
      materialFolder.ensureRoot()
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      materialFolder.ensureRoot()
      server.middlewares.use(createMiddleware())
    }
  }
}
