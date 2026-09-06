import { buildDemoPacket } from './src/data/meterDemoPacket.js'

function sendJson(res, data) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function createMiddleware() {
  let t = 0
  return (req, res, next) => {
    const url = (req.url || '').split('?')[0]
    if (req.method === 'GET' && url === '/__meter/poll') {
      t += 0.16
      sendJson(res, buildDemoPacket(t))
      return
    }
    if (req.method === 'GET' && url === '/__meter/empty') {
      sendJson(res, { device_status: 'online' })
      return
    }
    next()
  }
}

export function meterMockPlugin() {
  return {
    name: 'meter-mock',
    configureServer(server) {
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware())
    }
  }
}
