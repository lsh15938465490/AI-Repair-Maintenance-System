const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const materialFolder = require('./materialFolder.cjs')

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'AI电路板辅助维修系统',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  materialFolder.ensureRoot()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('materials-info', async () => materialFolder.info())
ipcMain.handle('materials-save', async (_event, payload) => {
  try {
    return materialFolder.saveSet(payload)
  } catch (error) {
    return { ok: false, error: error.message || '写入素材文件夹失败' }
  }
})
ipcMain.handle('materials-meta', async (_event, payload) => {
  try {
    return materialFolder.updateMeta(payload)
  } catch (error) {
    return { ok: false, error: error.message || '更新素材文件夹失败' }
  }
})
ipcMain.handle('materials-remove', async (_event, id) => {
  try {
    return materialFolder.removeSet(id)
  } catch (error) {
    return { ok: false, error: error.message || '删除素材文件夹失败' }
  }
})
ipcMain.handle('materials-open', async () => {
  const root = materialFolder.ensureRoot()
  const err = await shell.openPath(root)
  return { ok: !err, error: err || '', root }
})

ipcMain.handle('ai-request', async (_event, payload) => {
  const { url, method = 'POST', headers = {}, body } = payload || {}
  if (!url || typeof url !== 'string') {
    return { ok: false, status: 0, error: '缺少请求地址' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180000)

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }
    return { ok: res.ok, status: res.status, data, text }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.name === 'AbortError' ? '请求超时' : error?.message || '网络请求失败'
    }
  } finally {
    clearTimeout(timer)
  }
})
