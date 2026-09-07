import { defineStore } from 'pinia'
import { deleteDocument, listDocuments, saveDocument } from '@/utils/idb'

function isFolder(item) {
  return item?.kind === 'folder'
}

export const useKnowledgeStore = defineStore('knowledge', {
  state: () => ({
    documents: [],
    loaded: false
  }),
  getters: {
    files: (state) => state.documents.filter((item) => !isFolder(item)),
    enabledDocuments: (state) =>
      state.documents.filter(
        (item) => !isFolder(item) && item.enabled !== false && item.chunks?.length
      ),
    enabledCount() {
      return this.enabledDocuments.length
    },
    fileCount() {
      return this.files.length
    }
  },
  actions: {
    async load() {
      this.documents = await listDocuments()
      this.loaded = true
    },
    childrenOf(parentId) {
      const pid = parentId || ''
      return this.documents.filter((item) => (item.parentId || '') === pid)
    },
    folderByName(parentId, name) {
      return this.documents.find(
        (item) => isFolder(item) && (item.parentId || '') === (parentId || '') && item.name === name
      )
    },
    async add(doc) {
      await saveDocument(doc)
      await this.load()
      return doc
    },
    async addMany(docs) {
      for (const doc of docs) {
        await saveDocument(doc)
      }
      await this.load()
    },
    async toggle(id, enabled) {
      const doc = this.documents.find((item) => item.id === id)
      if (!doc || isFolder(doc)) return
      await saveDocument({ ...doc, enabled })
      await this.load()
    },
    async update(doc) {
      await saveDocument(doc)
      await this.load()
    },
    async remove(id) {
      const target = this.documents.find((item) => item.id === id)
      if (!target) return
      const ids = [id]
      if (isFolder(target)) {
        const walk = (parentId) => {
          this.documents.forEach((item) => {
            if ((item.parentId || '') === parentId) {
              ids.push(item.id)
              if (isFolder(item)) walk(item.id)
            }
          })
        }
        walk(id)
      }
      for (const itemId of ids) {
        await deleteDocument(itemId)
      }
      await this.load()
    }
  }
})
