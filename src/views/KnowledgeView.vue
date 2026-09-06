<template>
  <div>
    <h2 class="page-title">知识库</h2>
    <p class="page-desc">
      上传维修手册、故障案例、型号说明等资料，识别时会在本机检索相关片段并提供给大模型参考。资料只保存在当前浏览器或桌面应用本地。
    </p>

    <section class="panel">
      <div class="toolbar">
        <div>
          已启用 {{ knowledge.enabledCount }} / {{ knowledge.documents.length }} 篇
        </div>
        <el-upload
          :show-file-list="false"
          multiple
          accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          :auto-upload="false"
          :on-change="onUpload"
        >
          <span class="el-button el-button--primary">{{ uploading ? '解析中...' : '上传资料' }}</span>
        </el-upload>
      </div>
      <p class="page-desc">支持 txt、md、csv、json、pdf、docx。单文件不超过 8MB。扫描件 PDF 若无文字层将无法抽取内容。</p>
    </section>

    <section class="panel" style="margin-top: 16px">
      <el-table v-if="knowledge.documents.length" :data="knowledge.documents" style="width: 100%">
        <el-table-column prop="name" label="文件名" min-width="220" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ row.ext || '-' }}</template>
        </el-table-column>
        <el-table-column label="切片" width="90">
          <template #default="{ row }">{{ row.chunks?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="字数" width="110">
          <template #default="{ row }">{{ row.charCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="参与识别" width="110">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled !== false" @change="(val) => knowledge.toggle(row.id, val)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="danger" text @click="removeDoc(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="page-desc">暂无资料。上传后，维修识别会自动引用已启用的知识库内容。</p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useKnowledgeStore } from '@/stores/knowledge'
import { chunkText } from '@/services/rag'
import { extractKnowledgeText, isKnowledgeFile } from '@/utils/files'

const knowledge = useKnowledgeStore()
const uploading = ref(false)
const MAX_SIZE = 8 * 1024 * 1024
const MAX_DOCS = 30

onMounted(() => {
  knowledge.load().catch(() => {
    ElMessage.error('本地知识库读取失败')
  })
})

async function onUpload(uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (uploadFile.status && uploadFile.status !== 'ready') return
  if (!isKnowledgeFile(file)) {
    ElMessage.warning('仅支持 txt、md、csv、json、pdf、docx')
    return
  }
  if (file.size > MAX_SIZE) {
    ElMessage.warning('单个文件不能超过 8MB')
    return
  }
  if (knowledge.documents.length >= MAX_DOCS) {
    ElMessage.warning(`最多保存 ${MAX_DOCS} 篇资料`)
    return
  }

  uploading.value = true
  try {
    const rawText = await extractKnowledgeText(file)
    const chunks = chunkText(rawText)
    if (!chunks.length) {
      ElMessage.warning(`${file.name} 未解析到可用文字，请改用文本 PDF、docx 或 txt/md`)
      return
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    await knowledge.add({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      ext,
      enabled: true,
      createdAt: Date.now(),
      charCount: rawText.trim().length,
      chunks
    })
    ElMessage.success(`已入库：${file.name}（${chunks.length} 个切片）`)
  } catch (error) {
    ElMessageBox.alert(error.message || '资料解析失败', '上传失败', {
      confirmButtonText: '知道了',
      type: 'error'
    })
  } finally {
    uploading.value = false
  }
}

async function removeDoc(row) {
  await ElMessageBox.confirm(`删除「${row.name}」后不可恢复。`, '删除资料', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await knowledge.remove(row.id)
  ElMessage.success('已删除')
}
</script>
