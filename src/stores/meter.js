import { defineStore } from 'pinia'
import { createMeterClient } from '@/services/meterClient'
import { errorMessage } from '@/data/meterProtocol'

const METER_CFG_KEY = 'ai-pcb-meter-cfg-v1'

function loadCfg() {
  try {
    return {
      transport: 'demo',
      wsUrl: 'ws://127.0.0.1:5173/__meter',
      httpUrl: '/__meter/poll',
      ...JSON.parse(localStorage.getItem(METER_CFG_KEY) || '{}')
    }
  } catch {
    return { transport: 'demo', wsUrl: 'ws://127.0.0.1:5173/__meter', httpUrl: '/__meter/poll' }
  }
}

export const useMeterStore = defineStore('meter', {
  state: () => ({
    connection: 'offline',
    transport: loadCfg().transport,
    wsUrl: loadCfg().wsUrl,
    httpUrl: loadCfg().httpUrl,
    frozen: false,
    paused: false,
    packet: null,
    lastGood: null,
    statusMessage: '',
    skipLog: '',
    client: null
  }),
  getters: {
    livePacket(state) {
      return state.packet || state.lastGood
    }
  },
  actions: {
    persistCfg() {
      localStorage.setItem(
        METER_CFG_KEY,
        JSON.stringify({
          transport: this.transport,
          wsUrl: this.wsUrl,
          httpUrl: this.httpUrl
        })
      )
    },
    ensureClient() {
      if (this.client) return this.client
      this.client = createMeterClient({
        onPacket: (packet) => {
          if (this.frozen) return
          this.packet = packet
          this.lastGood = packet
          this.connection = packet.device_status === 'error' ? 'error' : 'online'
          this.statusMessage = errorMessage(packet.error_code)
        },
        onStatus: ({ status, message }) => {
          this.connection = status
          if (status === 'offline' || status === 'error') {
            this.frozen = true
            if (this.packet) this.packet = { ...this.packet, is_trigger: false }
          } else if (status === 'online' || status === 'connecting') {
            this.frozen = false
          }
          if (message) this.statusMessage = message
        },
        onLog: (msg) => {
          this.skipLog = msg
          console.warn('[meter]', msg)
        }
      })
      return this.client
    },
    connect() {
      this.persistCfg()
      this.frozen = false
      this.paused = false
      const url = this.transport === 'http' ? this.httpUrl : this.wsUrl
      this.ensureClient().connect({ transport: this.transport, url })
    },
    disconnect() {
      this.ensureClient().disconnect()
      this.frozen = true
    },
    togglePause() {
      this.paused = !this.paused
    }
  }
})
