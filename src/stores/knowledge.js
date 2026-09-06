import { defineStore } from 'pinia'
import { deleteDocument, listDocuments, saveDocument } from '@/utils/idb'

export const useKnowledgeStore = defineStore('knowledge', {
  state: () => ({
    documents: [],
    loaded: false
  }),
  getters: {
    enabledDocuments: (state) => state.documents.filter((item) => item.enabled !== false),
    enabledCount() {
      return this.enabledDocuments.length
    }
  },
  actions: {
    async load() {
      this.documents = await listDocuments()
      this.loaded = true
    },
    async add(doc) {
      await saveDocument(doc)
      await this.load()
    },
    async toggle(id, enabled) {
      const doc = this.documents.find((item) => item.id === id)
      if (!doc) return
      const next = { ...doc, enabled }
      await saveDocument(next)
      await this.load()
    },
    async remove(id) {
      await deleteDocument(id)
      await this.load()
    }
  }
})
