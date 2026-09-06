const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  aiRequest: (payload) => ipcRenderer.invoke('ai-request', payload),
  materialsInfo: () => ipcRenderer.invoke('materials-info'),
  materialsSave: (payload) => ipcRenderer.invoke('materials-save', payload),
  materialsMeta: (payload) => ipcRenderer.invoke('materials-meta', payload),
  materialsRemove: (id) => ipcRenderer.invoke('materials-remove', id),
  materialsOpen: () => ipcRenderer.invoke('materials-open')
})
