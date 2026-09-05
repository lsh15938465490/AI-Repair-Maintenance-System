const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  aiRequest: (payload) => ipcRenderer.invoke('ai-request', payload)
})
