const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  aiRequest: (payload) => ipcRenderer.invoke('ai-request', payload),
  materialsInfo: () => ipcRenderer.invoke('materials-info'),
  materialsSave: (payload) => ipcRenderer.invoke('materials-save', payload),
  materialsMeta: (payload) => ipcRenderer.invoke('materials-meta', payload),
  materialsRemove: (id) => ipcRenderer.invoke('materials-remove', id),
  materialsOpen: () => ipcRenderer.invoke('materials-open'),
  searchInfo: () => ipcRenderer.invoke('search-info'),
  searchPurge: () => ipcRenderer.invoke('search-purge'),
  searchSave: (payload) => ipcRenderer.invoke('search-save', payload),
  pcbAnnotate: (payload) => ipcRenderer.invoke('pcb-annotate', payload),
  aiStream: (payload, onChunk) => {
    const channel = `ai-stream-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const handler = (_event, chunk) => {
      if (chunk) onChunk(chunk)
    }
    ipcRenderer.on(channel, handler)
    return ipcRenderer.invoke('ai-stream', { ...(payload || {}), channel }).finally(() => {
      ipcRenderer.removeListener(channel, handler)
    })
  }
})
