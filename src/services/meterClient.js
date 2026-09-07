import { validatePacket } from '@/data/meterProtocol'
import { buildDemoPacket } from '@/data/meterDemoPacket'

const MIN_FRAME_MS = 50

export function createMeterClient({ onPacket, onStatus, onLog }) {
  let ws = null
  let pollTimer = 0
  let demoTimer = 0
  let demoT = 0
  let lastFrame = 0
  let stopped = false
  let mode = 'demo'

  function emitStatus(status, extra = {}) {
    onStatus?.({ status, ...extra })
  }

  function accept(raw) {
    const packet = validatePacket(raw)
    if (!packet) {
      onLog?.('字段缺失，已跳过本次渲染')
      return
    }
    const now = Date.now()
    if (now - lastFrame < MIN_FRAME_MS) return
    lastFrame = now
    onPacket(packet)
  }

  function stopAll() {
    stopped = true
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore
      }
      ws = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = 0
    }
    if (demoTimer) {
      clearInterval(demoTimer)
      demoTimer = 0
    }
  }

  function demoPacket() {
    demoT += 0.08
    return buildDemoPacket(demoT)
  }

  function startDemo() {
    mode = 'demo'
    stopped = false
    emitStatus('online', { transport: 'demo' })
    demoTimer = window.setInterval(() => {
      if (stopped) return
      accept(demoPacket())
    }, 80)
  }

  function startWebsocket(url) {
    mode = 'websocket'
    stopped = false
    emitStatus('connecting', { transport: 'websocket' })
    try {
      ws = new WebSocket(url)
    } catch (error) {
      emitStatus('error', { message: error.message || 'WebSocket 地址无效' })
      return
    }
    ws.onopen = () => emitStatus('online', { transport: 'websocket' })
    ws.onclose = () => {
      ws = null
      if (!stopped) emitStatus('offline', { message: 'WebSocket 已断开' })
    }
    ws.onerror = () => {
      if (!stopped) emitStatus('error', { message: 'WebSocket 连接异常' })
    }
    ws.onmessage = (event) => {
      try {
        accept(JSON.parse(event.data))
      } catch {
        onLog?.('设备上报不是合法 JSON，已跳过')
      }
    }
  }

  function startHttp(url) {
    mode = 'http'
    stopped = false
    emitStatus('online', { transport: 'http' })
    const tick = async () => {
      if (stopped) return
      try {
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        accept(data)
      } catch {
        emitStatus('error', { message: 'HTTP 轮询失败' })
      }
    }
    tick()
    pollTimer = window.setInterval(tick, 200)
  }

  return {
    connect({ transport, url }) {
      stopAll()
      stopped = false
      if (transport === 'websocket') startWebsocket(url)
      else if (transport === 'http') startHttp(url)
      else startDemo()
    },
    disconnect() {
      stopAll()
      emitStatus('offline', { message: '已断开设备' })
    },
    getMode: () => mode
  }
}
