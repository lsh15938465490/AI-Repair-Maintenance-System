<template>
  <div
    class="knowledge-page"
    v-loading="uploading"
    :element-loading-text="loadingText"
    element-loading-background="rgba(11, 18, 32, 0.78)"
  >
    <h2 class="page-title">知识库</h2>
    <p class="page-desc">
      上传维修手册、故障案例、型号说明等资料，识别时会在本机检索相关片段并提供给大模型参考。资料只保存在当前浏览器或桌面应用本地。
    </p>

    <section class="panel">
      <div class="toolbar">
        <div>
          已启用 {{ knowledge.enabledCount }} / {{ knowledge.fileCount }} 篇
        </div>
        <div class="toolbar-actions">
          <el-button :disabled="uploading" @click="createFolder">新建文件夹</el-button>
          <el-button :disabled="uploading" @click="createFile">新建文件</el-button>
          <el-upload
            :disabled="uploading"
            :show-file-list="false"
            multiple
            :auto-upload="false"
            :on-change="onUpload"
          >
            <span class="el-button el-button--primary" :class="{ 'is-disabled': uploading }">上传资料</span>
          </el-upload>
          <el-button :disabled="uploading" @click="folderInput?.click()">上传文件夹</el-button>
          <input
            ref="folderInput"
            class="hidden-input"
            type="file"
            webkitdirectory
            directory
            multiple
            @change="onFolderPicked"
          />
        </div>
      </div>
      <p class="page-desc">
        任意格式文件均可上传入库。能抽取到文字的资料会参与识别；扫描件 PDF、旧版 .doc 等若抽不出文字，仍会保存在知识库中，可下载，暂不参与检索。
      </p>
    </section>

    <section class="panel" style="margin-top: 16px">
      <div class="crumb">
        <el-button text type="primary" @click="openFolder('')">全部资料</el-button>
        <span v-for="item in breadcrumbs" :key="item.id">
          /
          <el-button text type="primary" @click="openFolder(item.id)">{{ item.name }}</el-button>
        </span>
      </div>
      <el-table v-if="visibleRows.length" :data="visibleRows" style="width: 100%" @row-dblclick="onRowOpen">
        <el-table-column label="名称" min-width="240">
          <template #default="{ row }">
            <button v-if="row.kind === 'folder'" class="name-btn" type="button" @click="openFolder(row.id)">
              📁 {{ row.name }}
            </button>
            <span v-else>📄 {{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ row.kind === 'folder' ? '文件夹' : row.ext || '-' }}</template>
        </el-table-column>
        <el-table-column label="切片" width="90">
          <template #default="{ row }">{{ row.kind === 'folder' ? '-' : row.chunks?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="字数" width="110">
          <template #default="{ row }">{{ row.kind === 'folder' ? '-' : row.charCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="参与识别" width="110">
          <template #default="{ row }">
            <el-switch
              v-if="row.kind !== 'folder'"
              :model-value="row.enabled !== false"
              @change="(val) => knowledge.toggle(row.id, val)"
            />
            <span v-else class="page-desc">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button v-if="row.kind !== 'folder'" type="primary" text @click="downloadDoc(row)">下载</el-button>
            <el-button type="danger" text @click="removeDoc(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="page-desc">当前文件夹为空。可新建文件夹、新建文件，或上传资料。</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useKnowledgeStore } from '@/stores/knowledge'
import { chunkText } from '@/services/rag'
import { extractKnowledgeText, fileToDataUrl } from '@/utils/files'

const knowledge = useKnowledgeStore()
const uploading = ref(false)
const uploadDone = ref(0)
const uploadTotal = ref(0)
const folderInput = ref(null)
const currentFolderId = ref('')
const pendingFiles = []
let flushTimer = 0

const loadingText = computed(() => {
  if (uploadTotal.value > 1) {
    return `正在入库 ${uploadDone.value}/${uploadTotal.value}，请稍候…`
  }
  return '正在上传知识库，请稍候…'
})

onMounted(() => {
  knowledge.load().catch(() => {
    ElMessage.error('本地知识库读取失败')
  })
})

const visibleRows = computed(() => {
  const pid = currentFolderId.value || ''
  return knowledge.documents
    .filter((item) => (item.parentId || '') === pid)
    .sort((a, b) => {
      const af = a.kind === 'folder' ? 0 : 1
      const bf = b.kind === 'folder' ? 0 : 1
      if (af !== bf) return af - bf
      return String(a.name).localeCompare(String(b.name), 'zh')
    })
})

const breadcrumbs = computed(() => {
  const trail = []
  let id = currentFolderId.value
  while (id) {
    const folder = knowledge.documents.find((item) => item.id === id)
    if (!folder) break
    trail.unshift(folder)
    id = folder.parentId || ''
  }
  return trail
})

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function openFolder(id) {
  currentFolderId.value = id || ''
}

function onRowOpen(row) {
  if (row?.kind === 'folder') openFolder(row.id)
}

function mimeOf(name, ext, type = '') {
  if (type) return type
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'json') return 'application/json'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'md') return 'text/markdown'
  return 'application/octet-stream'
}

async function createFolder() {
  const { value } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
    confirmButtonText: '创建',
    cancelButtonText: '取消',
    inputValue: '新建文件夹',
    inputPattern: /\S+/,
    inputErrorMessage: '名称不能为空'
  }).catch(() => ({ value: '' }))
  const name = String(value || '').trim()
  if (!name) return
  if (knowledge.folderByName(currentFolderId.value, name)) {
    ElMessage.warning('当前目录已有同名文件夹')
    return
  }
  await knowledge.add({
    id: makeId(),
    kind: 'folder',
    name,
    parentId: currentFolderId.value || '',
    createdAt: Date.now(),
    enabled: false
  })
  ElMessage.success('已创建文件夹')
}

async function createFile() {
  const { value } = await ElMessageBox.prompt('请输入文件名（建议 .txt / .md）', '新建文件', {
    confirmButtonText: '下一步',
    cancelButtonText: '取消',
    inputValue: '未命名.txt',
    inputPattern: /\S+/,
    inputErrorMessage: '文件名不能为空'
  }).catch(() => ({ value: '' }))
  let name = String(value || '').trim()
  if (!name) return
  if (!/\.(txt|md|csv|json)$/i.test(name)) name = `${name}.txt`
  const contentBox = await ElMessageBox.prompt('请输入文件内容', '新建文件', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputValue: ''
  }).catch(() => ({ value: null }))
  if (contentBox.value == null) return
  const rawText = String(contentBox.value || '')
  const chunks = chunkText(rawText)
  const ext = (name.split('.').pop() || 'txt').toLowerCase()
  await knowledge.add({
    id: makeId(),
    kind: 'file',
    name,
    ext,
    parentId: currentFolderId.value || '',
    enabled: Boolean(chunks.length),
    createdAt: Date.now(),
    charCount: rawText.trim().length,
    chunks,
    rawText,
    dataUrl: `data:${mimeOf(name, ext)};charset=utf-8,${encodeURIComponent(rawText)}`
  })
  ElMessage.success(chunks.length ? `已创建 ${name}` : `已创建 ${name}（内容过短，暂不参与识别）`)
}

async function ingestFile(file, parentId, displayName = '') {
  const name = displayName || file.name
  let rawText = ''
  try {
    rawText = await extractKnowledgeText(file)
  } catch {
    rawText = ''
  }
  const chunks = chunkText(rawText)
  const ext = (name.split('.').pop() || '').toLowerCase()
  let dataUrl = ''
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    dataUrl = `data:${mimeOf(name, ext, file.type)};charset=utf-8,${encodeURIComponent(rawText)}`
  }
  const doc = {
    id: makeId(),
    kind: 'file',
    name: name.split(/[/\\]/).pop(),
    ext,
    parentId: parentId || '',
    enabled: Boolean(chunks.length),
    createdAt: Date.now(),
    charCount: rawText.trim().length,
    chunks,
    rawText,
    dataUrl
  }
  try {
    await knowledge.add(doc)
  } catch {
    await knowledge.add({ ...doc, dataUrl: '' })
  }
  return { skipped: false, name: doc.name, chunks: chunks.length }
}

async function onUpload(uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (uploadFile.status && uploadFile.status !== 'ready') return
  pendingFiles.push(file)
  uploading.value = true
  uploadTotal.value = pendingFiles.length
  if (flushTimer) return
  flushTimer = window.setTimeout(flushPendingUploads, 80)
}

async function flushPendingUploads() {
  flushTimer = 0
  const files = pendingFiles.splice(0, pendingFiles.length)
  if (!files.length) {
    uploading.value = false
    return
  }
  uploading.value = true
  uploadDone.value = 0
  uploadTotal.value = files.length
  try {
    for (const file of files) {
      const result = await ingestFile(file, currentFolderId.value)
      uploadDone.value += 1
      ElMessage.success(
        result.chunks
          ? `已入库：${file.name}（${result.chunks} 个切片）`
          : `已入库：${file.name}（暂未抽到文字，仍保存在知识库）`
      )
    }
  } catch (error) {
    ElMessageBox.alert(error.message || '资料解析失败', '上传失败', {
      confirmButtonText: '知道了',
      type: 'error'
    })
  } finally {
    if (!pendingFiles.length) {
      uploading.value = false
      uploadDone.value = 0
      uploadTotal.value = 0
    }
  }
}

async function ensureFolderPath(parts, rootId) {
  let parentId = rootId || ''
  for (const part of parts) {
    const name = String(part || '').trim()
    if (!name || name === '.' || name === '..') continue
    let folder = knowledge.folderByName(parentId, name)
    if (!folder) {
      folder = {
        id: makeId(),
        kind: 'folder',
        name,
        parentId,
        createdAt: Date.now(),
        enabled: false
      }
      await knowledge.add(folder)
    }
    parentId = folder.id
  }
  return parentId
}

async function onFolderPicked(event) {
  const input = event.target
  const files = [...(input.files || [])]
  input.value = ''
  if (!files.length) return
  uploading.value = true
  uploadDone.value = 0
  uploadTotal.value = files.length
  let ok = 0
  try {
    for (const file of files) {
      const rel = String(file.webkitRelativePath || file.name).replace(/\\/g, '/')
      const segs = rel.split('/').filter(Boolean)
      const fileName = segs.pop()
      const parentId = await ensureFolderPath(segs, currentFolderId.value)
      await ingestFile(file, parentId, fileName)
      ok += 1
      uploadDone.value = ok
    }
    ElMessage.success(`文件夹已处理：入库 ${ok} 个文件`)
  } catch (error) {
    ElMessageBox.alert(error.message || '文件夹上传失败', '上传失败', {
      confirmButtonText: '知道了',
      type: 'error'
    })
  } finally {
    uploading.value = false
    uploadDone.value = 0
    uploadTotal.value = 0
  }
}

function downloadDoc(row) {
  const name = row.name || '知识库资料'
  let href = row.dataUrl
  if (!href) {
    const text = row.rawText || (row.chunks || []).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    href = URL.createObjectURL(blob)
  }
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.click()
  if (!row.dataUrl) URL.revokeObjectURL(href)
  ElMessage.success(`已开始下载 ${name}`)
}

async function removeDoc(row) {
  const tip =
    row.kind === 'folder'
      ? `删除文件夹「${row.name}」及其内部全部资料后不可恢复。`
      : `删除「${row.name}」后不可恢复。`
  await ElMessageBox.confirm(tip, '删除资料', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  if (row.kind === 'folder' && currentFolderId.value === row.id) {
    currentFolderId.value = row.parentId || ''
  }
  await knowledge.remove(row.id)
  ElMessage.success('已删除')
}
</script>

<style scoped>
.knowledge-page {
  position: relative;
  min-height: calc(100vh - 96px);
}

.knowledge-page :deep(.el-loading-mask) {
  z-index: 20;
}

.knowledge-page :deep(.el-loading-text) {
  color: var(--text);
  font-size: 15px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.hidden-input {
  display: none;
}

.crumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
}

.name-btn {
  border: 0;
  background: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font: inherit;
}

.name-btn:hover {
  text-decoration: underline;
}
</style>
