import { defineStore } from 'pinia'

const HISTORY_KEY = 'ai-pcb-repair-history-v1'

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

export const useRepairStore = defineStore('repair', {
  state: () => ({
    history: loadHistory()
  }),
  actions: {
    addRecord(record) {
      this.history.unshift(record)
      this.history = this.history.slice(0, 20)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history))
    }
  }
})
