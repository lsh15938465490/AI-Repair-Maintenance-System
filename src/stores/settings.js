import { defineStore } from 'pinia'
import { encryptText, decryptText } from '@/utils/crypto'
import { PROVIDERS } from '@/services/providers'

const STORAGE_KEY = 'ai-pcb-repair-settings-v1'

function emptyKeys() {
  return PROVIDERS.reduce((acc, item) => {
    acc[item.id] = ''
    return acc
  }, {})
}

function loadState() {
  const defaults = {
    currentProvider: 'qwen',
    apiKeys: emptyKeys()
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw)
    const apiKeys = emptyKeys()
    Object.keys(apiKeys).forEach((id) => {
      apiKeys[id] = decryptText(parsed.apiKeys?.[id] || '')
    })
    return {
      currentProvider: parsed.currentProvider || 'qwen',
      apiKeys
    }
  } catch {
    return defaults
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => loadState(),
  getters: {
    currentKey: (state) => state.apiKeys[state.currentProvider] || ''
  },
  actions: {
    persist() {
      const payload = {
        currentProvider: this.currentProvider,
        apiKeys: Object.fromEntries(
          Object.entries(this.apiKeys).map(([id, key]) => [id, encryptText(key.trim())])
        )
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    },
    applyDraft(draft) {
      this.currentProvider = draft.currentProvider
      this.apiKeys = { ...draft.apiKeys }
      this.persist()
    },
    reset() {
      this.currentProvider = 'qwen'
      this.apiKeys = emptyKeys()
      localStorage.removeItem(STORAGE_KEY)
    }
  }
})
