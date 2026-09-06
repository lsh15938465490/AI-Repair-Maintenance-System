const DB_NAME = 'ai-pcb-knowledge'
const STORE = 'documents'
const MATERIALS = 'materials'
const VERSION = 2

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(MATERIALS)) {
        db.createObjectStore(MATERIALS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('无法打开本地知识库'))
  })
}

function tx(storeName, mode, handler) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const objectStore = transaction.objectStore(storeName)
        const request = handler(objectStore)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

export function listDocuments() {
  return tx(STORE, 'readonly', (store) => store.getAll()).then((rows) =>
    (rows || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  )
}

export function saveDocument(doc) {
  return tx(STORE, 'readwrite', (store) => store.put(doc))
}

export function deleteDocument(id) {
  return tx(STORE, 'readwrite', (store) => store.delete(id))
}

export function clearDocuments() {
  return tx(STORE, 'readwrite', (store) => store.clear())
}

export function listMaterials() {
  return tx(MATERIALS, 'readonly', (store) => store.getAll()).then((rows) =>
    (rows || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  )
}

export function saveMaterial(item) {
  return tx(MATERIALS, 'readwrite', (store) => store.put(item))
}

export function deleteMaterial(id) {
  return tx(MATERIALS, 'readwrite', (store) => store.delete(id))
}
