<template>
  <div class="repair-workspace">
    <div class="repair-main">
    <div class="repair-head">
      <h2 class="page-title">维修识别</h2>
      <el-tabs v-model="activeTab" class="repair-inline-tabs">
        <el-tab-pane label="图片上传" name="upload" />
        <el-tab-pane label="元件标注图" name="annotate" />
        <el-tab-pane label="开始识别" name="analyze" />
      </el-tabs>
    </div>

    <div v-show="activeTab === 'upload'">
    <p class="page-desc">上传电路板正面实拍图（必填），反面与原理图选填。识别前将校验图片与 API 配置。</p>

    <div class="upload-grid">
      <section class="panel upload-card">
        <h3>电路板正面实拍图（必填）</h3>
        <p class="page-desc">支持全部图片格式</p>
        <div class="upload-actions">
          <el-upload
            :show-file-list="false"
            accept="image/*"
            :auto-upload="false"
            :on-change="(file) => onImageChange('front', file)"
          >
            <span class="el-button el-button--primary">上传正面图</span>
          </el-upload>
          <el-button @click="openMaterialPicker('front')">从素材库选择</el-button>
        </div>
        <div class="preview-box" style="margin-top: 12px">
          <img v-if="frontUrl" :src="frontUrl" alt="正面图" />
          <span v-else>尚未上传</span>
        </div>
      </section>

      <section class="panel upload-card">
        <h3>电路板反面实拍图（选填）</h3>
        <p class="page-desc">支持全部图片格式，不上传也可识别</p>
        <div class="upload-actions">
          <el-upload
            :show-file-list="false"
            accept="image/*"
            :auto-upload="false"
            :on-change="(file) => onImageChange('back', file)"
          >
            <span class="el-button">上传反面图</span>
          </el-upload>
          <el-button @click="openMaterialPicker('back')">从素材库选择</el-button>
        </div>
        <el-button v-if="backUrl" text type="danger" @click="clearBack">清除反面图</el-button>
        <div class="preview-box" style="margin-top: 12px">
          <img v-if="backUrl" :src="backUrl" alt="反面图" />
          <span v-else>未上传（不影响识别）</span>
        </div>
      </section>

      <section class="panel upload-card">
        <h3>电路原理图（选填）</h3>
        <p class="page-desc">支持全部图片格式或 PDF，不上传也可识别</p>
        <div class="upload-actions">
          <el-upload
            :show-file-list="false"
            accept="image/*,.pdf,application/pdf"
            :auto-upload="false"
            :on-change="onSchematicChange"
          >
            <span class="el-button">上传原理图</span>
          </el-upload>
          <el-button @click="openMaterialPicker('schematic')">从素材库选择</el-button>
        </div>
        <el-button v-if="schematicUrl" text type="danger" @click="clearSchematic">清除原理图</el-button>
        <div class="preview-box" style="margin-top: 12px">
          <img v-if="schematicUrl" :src="schematicUrl" alt="原理图" />
          <span v-else>未上传（不影响识别）</span>
        </div>
      </section>
    </div>

    <div class="toolbar upload-toolbar">
      <div class="upload-toolbar-meta">
        当前模型：<strong>{{ providerName }}</strong>
        <span class="page-desc" style="margin-left: 12px">
          知识库：
          <template v-if="knowledge.enabledCount">
            已启用 {{ knowledge.enabledCount }} 篇
            <el-switch v-model="useKnowledge" style="margin-left: 8px" />
            本次识别参考
          </template>
          <template v-else>
            暂无资料，可到
            <router-link to="/knowledge" style="color: var(--accent)">知识库</router-link>
            上传
          </template>
        </span>
      </div>
      <div class="upload-toolbar-actions">
        <el-button
          :disabled="!canSaveToMaterials"
          :loading="savingMaterials"
          :title="saveToMaterialsHint"
          @click="saveUploadsToMaterials"
        >
          保存到素材库
        </el-button>
        <el-button :loading="mapLoading" @click="openComponentMap">元件标注图</el-button>
        <el-button type="primary" :loading="loading" @click="startAnalyze">开始识别</el-button>
      </div>
    </div>
    </div>

    <div v-if="activeTab === 'annotate'" class="tab-panel-body annotate-split-page">
      <div class="panel map-tab-panel annotate-left">
        <ComponentMapPanel
          :image-url="frontUrl"
          :generating="mapLoading"
          :status-text="mapStatus"
          v-model:title="mapTitle"
          v-model:labels="mapLabels"
          :divider-y="mapDividerY"
          @generate="generateComponentMap"
          @close="activeTab = 'upload'"
          @select="onMapSelect"
        />
      </div>
      <ScopeMeterPanel class="annotate-right" :selected-label="selectedComponentText" />
    </div>

    <div v-show="activeTab === 'analyze'">
      <p class="page-desc">根据已上传图片与当前模型进行故障识别，结果在本页展示。</p>
      <div class="toolbar">
        <div>
          当前模型：<strong>{{ providerName }}</strong>
        </div>
        <el-button type="primary" :loading="loading" @click="startAnalyze">开始识别</el-button>
      </div>

      <section v-if="result" class="panel">
        <div class="toolbar">
          <h3 style="margin: 0">识别结果</h3>
          <el-button @click="copyAll">复制全文</el-button>
        </div>
        <div class="result-grid">
          <div>
            <h4>图片对齐检测</h4>
            <el-tag :type="result.alignment?.status === 'aligned' ? 'success' : 'warning'">
              {{ result.alignment?.status === 'aligned' ? '对齐正常' : '存在角度偏差' }}
            </el-tag>
            <p>{{ result.alignment?.detail || '暂无说明' }}</p>
          </div>
          <div>
            <h4>电路板型号</h4>
            <p>{{ result.modelNumber || '未识别到明确型号' }}</p>
          </div>
        </div>
        <div v-if="result.faultModel">
          <h4>故障定性推理</h4>
          <p>{{ result.faultModel }}</p>
        </div>
        <h4>故障点位与原因</h4>
        <div v-if="result.faults?.length">
          <div v-for="(item, index) in result.faults" :key="index" class="fault-item">
            <strong>{{ item.location }} · {{ item.type }}</strong>
            <el-tag v-if="item.level" size="small" style="margin-left: 8px">{{ item.level }}</el-tag>
            <p>{{ item.reason }}</p>
          </div>
        </div>
        <p v-else>未给出明确故障点位。</p>
        <h4 v-if="result.knowledgeRefs?.length">知识库引用</h4>
        <div v-if="result.knowledgeRefs?.length">
          <div v-for="(item, index) in result.knowledgeRefs" :key="index" class="fault-item">
            {{ item }}
          </div>
        </div>
        <h4>分步维修排查与修复步骤</h4>
        <div v-for="(step, index) in result.repairSteps || []" :key="index" class="step-item">
          <strong>{{ index + 1 }}. {{ step.title }}</strong>
          <p>{{ step.content }}</p>
        </div>
        <h4 v-if="result.riskWarnings?.length">维修风险预警</h4>
        <div v-if="result.riskWarnings?.length">
          <div v-for="(item, index) in result.riskWarnings" :key="index" class="fault-item">
            {{ item }}
          </div>
        </div>
        <h4 v-if="result.verification?.length">验收验证标准</h4>
        <div v-if="result.verification?.length">
          <div v-for="(item, index) in result.verification" :key="index" class="step-item">
            {{ item }}
          </div>
        </div>
      </section>
      <section v-else class="panel">
        <p class="page-desc" style="margin: 0">暂无识别结果。请先在「图片上传」中上传正面图，再点击开始识别。</p>
      </section>

      <section class="panel" style="margin-top: 16px">
        <h3>本地操作记录</h3>
        <div v-if="repairStore.history.length">
          <div v-for="item in repairStore.history" :key="item.time" class="history-item">
            {{ item.time }} · {{ item.provider }} · {{ item.modelNumber }} · {{ item.summary }}
          </div>
        </div>
        <p v-else class="page-desc">暂无记录，识别成功后会保存在当前浏览器/桌面应用本地。</p>
      </section>
    </div>
    </div>

    <el-dialog
      v-model="pickerOpen"
      :title="pickerTitle"
      width="820px"
      append-to-body
      destroy-on-close
    >
      <el-input v-model="pickerKeyword" placeholder="搜索标题" clearable style="margin-bottom: 12px" />
      <div v-if="pickerList.length" class="picker-grid">
        <article
          v-for="item in pickerList"
          :key="item.id"
          class="picker-card"
          @click="applyMaterial(item)"
        >
          <img v-if="coverSrc(item)" :src="coverSrc(item)" :alt="item.title" />
          <span>{{ item.title }}</span>
        </article>
      </div>
      <p v-else class="page-desc">素材库为空。请先到「查找」中保存图片到素材库。</p>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useRepairStore } from '@/stores/repair'
import { useKnowledgeStore } from '@/stores/knowledge'
import { coverSrc, useMaterialsStore } from '@/stores/materials'
import { getProvider } from '@/services/providers'
import { analyzeBoard, annotateComponentsUntilComplete } from '@/services/ai'
import { runPcbAnnotatePipeline } from '@/utils/pcbAnnotate'
import { buildKnowledgeContext, retrieveChunks } from '@/services/rag'
import ComponentMapPanel from '@/components/ComponentMapPanel.vue'
import ScopeMeterPanel from '@/components/ScopeMeterPanel.vue'
import { ALL_BRAND_VALUE } from '@/data/pcbIconCatalog'
import {
  compressImage,
  fileToDataUrl,
  isAllowedImage,
  isAllowedSchematic,
  pdfToImageDataUrl
} from '@/utils/files'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()
const repairStore = useRepairStore()
const frontUrl = computed({
  get: () => repairStore.frontUrl || '',
  set: (value) => {
    repairStore.frontUrl = value || ''
  }
})
const backUrl = computed({
  get: () => repairStore.backUrl || '',
  set: (value) => {
    repairStore.backUrl = value || ''
  }
})
const schematicUrl = computed({
  get: () => repairStore.schematicUrl || '',
  set: (value) => {
    repairStore.schematicUrl = value || ''
  }
})
const sourceMaterialId = computed({
  get: () => repairStore.sourceMaterialId || '',
  set: (value) => {
    repairStore.sourceMaterialId = value || ''
  }
})
const knowledge = useKnowledgeStore()
const materials = useMaterialsStore()
const pickerOpen = ref(false)
const pickerSlot = ref('front')
const pickerKeyword = ref('')
const savingMaterials = ref(false)
const loading = ref(false)
const activeTab = ref('upload')
const useKnowledge = ref(true)
const result = ref(null)
const mapLoading = ref(false)
const mapStatus = ref('')
const mapTitle = ref('一张图看懂电路板')
const mapDividerY = ref(null)
const mapLabels = ref([])
const selectedComponentText = ref('')

function onMapSelect(item) {
  selectedComponentText.value = item?.text ? String(item.text) : ''
}

const providerName = computed(() => getProvider(settings.currentProvider).name)
const canSaveToMaterials = computed(
  () =>
    Boolean(frontUrl.value && backUrl.value && schematicUrl.value && !sourceMaterialId.value)
)

const saveToMaterialsHint = computed(() => {
  if (sourceMaterialId.value) return '已从素材库载入，无需再保存'
  if (!frontUrl.value || !backUrl.value || !schematicUrl.value) {
    return '请同时上传正面图、反面图和原理图后再保存'
  }
  return '保存到素材库'
})

const pickerTitle = computed(() => {
  if (pickerSlot.value === 'back') return '从素材库选择反面图'
  if (pickerSlot.value === 'schematic') return '从素材库选择原理图'
  return '从素材库选择正面图'
})

const pickerList = computed(() => {
  const q = pickerKeyword.value.trim().toLowerCase()
  if (!q) return materials.items
  return materials.items.filter((item) => `${item.title} ${item.note || ''}`.toLowerCase().includes(q))
})

onMounted(() => {
  knowledge.load().catch(() => {})
  materials.load()
    .then(async () => {
      if (route.query.material) await applyIncomingMaterial()
      else repairStore.setBoard({ sourceMaterialId: '' })
    })
    .catch(() => {})
})

watch(
  () => route.query.material,
  (id, prev) => {
    if (id && id !== prev) applyIncomingMaterial()
  }
)

async function maybeCompress(src) {
  if (!src) return ''
  if (src.startsWith('data:image') && !src.includes('svg')) {
    try {
      return await compressImage(src)
    } catch {
      return src
    }
  }
  return src
}

async function applyIncomingMaterial() {
  const id = route.query.material
  if (!id) return
  if (!materials.loaded) {
    try {
      await materials.load()
    } catch {
      ElMessage.error('本地素材库读取失败')
      return
    }
  }
  const item = materials.items.find((row) => row.id === String(id))
  if (!item) {
    ElMessage.warning('未找到对应条目')
    return
  }
  if (!item.front && !item.back && !item.schematic) {
    ElMessage.warning('该条目没有可用图片')
    return
  }
  repairStore.setBoard({
    front: item.front || '',
    back: item.back || '',
    schematic: item.schematic || '',
    sourceMaterialId: item.id
  })
  mapLabels.value = []
  activeTab.value = 'upload'
  ElMessage.success('已载入素材库图片')
  router.replace({ name: 'repair' })
}

async function onImageChange(side, uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (!isAllowedImage(file)) {
    ElMessage.warning('请上传图片文件')
    return
  }
  try {
    const dataUrl = await fileToDataUrl(file)
    const compressed = await compressImage(dataUrl)
    if (side === 'front') {
      frontUrl.value = compressed
      mapLabels.value = []
    } else backUrl.value = compressed
  } catch {
    ElMessage.warning('当前浏览器无法解析该图片格式，请换一张后再试')
  }
}

async function onSchematicChange(uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (!isAllowedSchematic(file)) {
    ElMessage.warning('原理图请上传图片或 PDF')
    return
  }
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    schematicUrl.value = await pdfToImageDataUrl(file)
  } else {
    schematicUrl.value = await compressImage(await fileToDataUrl(file))
  }
}

function clearBack() {
  backUrl.value = ''
}

function clearSchematic() {
  schematicUrl.value = ''
}

function materialSrc(item) {
  if (pickerSlot.value === 'back') return item.back || coverSrc(item)
  if (pickerSlot.value === 'schematic') return item.schematic || coverSrc(item)
  return item.front || coverSrc(item)
}

function openMaterialPicker(slot) {
  pickerSlot.value = slot
  pickerKeyword.value = ''
  pickerOpen.value = true
  materials.load().catch(() => {})
}

async function applyMaterial(item) {
  const src = materialSrc(item)
  if (!src) {
    ElMessage.warning('该条目没有可用图片')
    return
  }
  let next = await maybeCompress(src)
  if (pickerSlot.value === 'front') {
    frontUrl.value = next
    mapLabels.value = []
  } else if (pickerSlot.value === 'back') {
    backUrl.value = next
  } else {
    schematicUrl.value = next
  }
  pickerOpen.value = false
  ElMessage.success('已从素材库选用')
}

async function saveUploadsToMaterials() {
  if (!canSaveToMaterials.value) {
    ElMessage.warning('请先上传正面图、反面图和原理图')
    return
  }
  savingMaterials.value = true
  try {
    if (sourceMaterialId.value) {
      const result = await materials.updateBoardSet(sourceMaterialId.value, {
        front: frontUrl.value,
        back: backUrl.value,
        schematic: schematicUrl.value
      })
      if (result?.missing) {
        repairStore.setBoard({ sourceMaterialId: '' })
      } else {
        ElMessage.success('已保存到素材库')
        return
      }
    }
    const result = await materials.addBoardSet({
      title: '维修识别素材',
      front: frontUrl.value,
      back: backUrl.value,
      schematic: schematicUrl.value,
      meta: {
        categoryId: 'appliance',
        productId: 'washer',
        brand: ALL_BRAND_VALUE,
        extra: ''
      }
    })
    if (result.duplicated) ElMessage.info('该组图片已在素材库中')
    else {
      repairStore.setBoard({ sourceMaterialId: result.id || '' })
      ElMessage.success('已保存到素材库')
    }
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    savingMaterials.value = false
  }
}

function buildFullText(data) {
  const faults = (data.faults || [])
    .map((item) => `${item.location} / ${item.type}：${item.reason}`)
    .join('\n')
  const steps = (data.repairSteps || [])
    .map((item, index) => `${index + 1}. ${item.title}\n${item.content}`)
    .join('\n\n')
  return [
    `对齐检测：${data.alignment?.status === 'aligned' ? '对齐正常' : '存在角度偏差'}`,
    data.alignment?.detail || '',
    `型号：${data.modelNumber || '未识别到明确型号'}`,
    `故障定性：${data.faultModel || '无'}`,
    '故障点位：',
    faults || '无',
    '知识库引用：',
    (data.knowledgeRefs || []).join('\n') || '无',
    '维修步骤：',
    steps || '无',
    '风险预警：',
    (data.riskWarnings || []).join('\n') || '无',
    '验收标准：',
    (data.verification || []).join('\n') || '无'
  ].join('\n')
}

async function copyAll() {
  if (!result.value) return
  await navigator.clipboard.writeText(buildFullText(result.value))
  ElMessage.success('已复制全文')
}

function normalizeLabels(raw) {
  return (raw || []).map((item, index) => ({
    id: `${Date.now()}-${index}`,
    text: String(item.text || '未命名'),
    labelX: Number(item.labelX ?? item.lx ?? 0.1),
    labelY: Number(item.labelY ?? item.ly ?? 0.1),
    targetX: Number(item.targetX ?? item.tx ?? 0.3),
    targetY: Number(item.targetY ?? item.ty ?? 0.3),
    textColor: item.textColor || '#e53935',
    lineColor: item.lineColor || '#e53935'
  }))
}

async function openComponentMap() {
  if (!frontUrl.value) {
    await ElMessageBox.alert('请先上传电路板正面实拍图片，再生成元件标注图', '无法生成标注', {
      confirmButtonText: '知道了',
      type: 'warning'
    })
    return
  }
  activeTab.value = 'annotate'
  if (!mapLabels.value.length) await generateComponentMap()
}

async function generateComponentMap() {
  if (!frontUrl.value) {
    await ElMessageBox.alert('请先上传电路板正面实拍图片，再生成元件标注图', '无法生成标注', {
      confirmButtonText: '知道了',
      type: 'warning'
    })
    return
  }
  if (!settings.currentKey) {
    await ElMessageBox.alert('请先配置对应大模型API密钥，或先手动添加文字标注', '无法自动生成标注', {
      confirmButtonText: '知道了',
      type: 'warning'
    })
    return
  }
  activeTab.value = 'annotate'
  mapLoading.value = true
  mapStatus.value = '准备生成全量标注…'
  try {
    mapStatus.value = 'YOLOv11 定位元件，再逐个用视觉模型命名…'
    const pipeline = await runPcbAnnotatePipeline({
      image: frontUrl.value,
      apiKey: settings.currentKey
    }).catch((error) => ({ ok: false, error: error.message }))

    if (pipeline?.ok && pipeline.labels?.length) {
      mapTitle.value = '一张图看懂电路板'
      mapDividerY.value = null
      mapLabels.value = normalizeLabels(pipeline.labels)
      const skipTip = pipeline.skipped ? `，跳过 ${pipeline.skipped} 项` : ''
      const outTip = pipeline.output ? `。OpenCV 成品：${pipeline.output}` : ''
      mapStatus.value = `YOLO 检出 ${pipeline.detected}，已标注 ${mapLabels.value.length}${skipTip}${outTip}`
      ElMessage.success(`已按检测框叠加红箭头标注 ${mapLabels.value.length} 项，底图未改画`)
      return
    }

    mapStatus.value = pipeline?.error
      ? `YOLO 流水线不可用（${pipeline.error}），改用全图视觉标注…`
      : 'YOLO 流水线无结果，改用全图视觉标注…'
    const images = [frontUrl.value]
    if (backUrl.value) images.push(backUrl.value)
    if (schematicUrl.value) images.push(schematicUrl.value)
    let knowledgeContext = ''
    if (useKnowledge.value && knowledge.enabledCount) {
      knowledgeContext = buildKnowledgeContext(retrieveChunks(knowledge.enabledDocuments))
    }
    const data = await annotateComponentsUntilComplete({
      providerId: settings.currentProvider,
      apiKey: settings.currentKey,
      images,
      knowledgeContext,
      onProgress: (msg) => {
        mapStatus.value = msg
      }
    })
    mapTitle.value = data.title || '一张图看懂电路板'
    mapDividerY.value = typeof data.dividerY === 'number' ? data.dividerY : null
    mapLabels.value = normalizeLabels(data.labels)
    const tip = data.complete
      ? `复查通过：名称与箭头位置已核对，文字已避让，共 ${mapLabels.value.length} 项`
      : `已标注 ${mapLabels.value.length} 项并完成多轮名称与箭头复查，请再核对箭头是否指在对应元件中心`
    ElMessage.success(tip)
  } catch (error) {
    ElMessageBox.alert(error.message || '标注生成失败', '生成失败', {
      confirmButtonText: '知道了',
      type: 'error'
    })
  } finally {
    mapLoading.value = false
  }
}

async function startAnalyze() {
  if (!frontUrl.value) {
    activeTab.value = 'upload'
    await ElMessageBox.alert(
      '请先上传电路板正面实拍图片，再进行识别',
      '无法开始识别',
      { confirmButtonText: '知道了', type: 'warning' }
    )
    return
  }

  if (!settings.currentKey) {
    await ElMessageBox.alert(
      '请先配置对应大模型API密钥',
      '无法开始识别',
      { confirmButtonText: '去配置', type: 'warning' }
    )
    router.push('/settings')
    return
  }

  activeTab.value = 'analyze'
  loading.value = true
  try {
    const images = [frontUrl.value]
    if (backUrl.value) images.push(backUrl.value)
    if (schematicUrl.value) images.push(schematicUrl.value)
    let knowledgeContext = ''
    if (useKnowledge.value && knowledge.enabledCount) {
      const hits = retrieveChunks(knowledge.enabledDocuments)
      knowledgeContext = buildKnowledgeContext(hits)
    }
    const data = await analyzeBoard({
      providerId: settings.currentProvider,
      apiKey: settings.currentKey,
      images,
      hasSchematic: Boolean(schematicUrl.value),
      hasBack: Boolean(backUrl.value),
      knowledgeContext
    })
    result.value = data
    repairStore.addRecord({
      time: new Date().toLocaleString(),
      provider: providerName.value,
      modelNumber: data.modelNumber || '未知型号',
      summary: data.alignment?.status === 'aligned' ? '对齐正常' : '存在角度偏差'
    })
    ElMessage.success('识别完成')
  } catch (error) {
    ElMessageBox.alert(error.message || '识别失败，请检查网络与密钥', '识别失败', {
      confirmButtonText: '知道了',
      type: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.repair-head {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 8px;
}

.repair-head .page-title {
  margin: 0;
  flex-shrink: 0;
}

.repair-inline-tabs {
  flex: 1;
  min-width: 0;
}

.repair-inline-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom-color: var(--line);
}

.repair-inline-tabs :deep(.el-tabs__item) {
  color: var(--muted);
}

.repair-inline-tabs :deep(.el-tabs__item.is-active) {
  color: var(--accent);
}

.repair-inline-tabs :deep(.el-tabs__active-bar) {
  background: var(--accent);
}

.repair-inline-tabs :deep(.el-tabs__nav-wrap::after) {
  background: var(--line);
}

.repair-inline-tabs :deep(.el-tabs__content) {
  display: none;
}

.tab-panel-body,
.map-tab-panel {
  min-height: calc(100vh - 140px);
}

.map-tab-panel {
  height: calc(100vh - 140px);
}

.annotate-split-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
  height: calc(100vh - 132px);
  min-height: 560px;
  align-items: stretch;
}

.annotate-split-page.tab-panel-body,
.annotate-split-page .map-tab-panel {
  min-height: 0;
  height: 100%;
}

.annotate-left,
.annotate-right {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 1100px) {
  .annotate-split-page {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
  }

  .annotate-split-page .map-tab-panel {
    height: min(70vh, 720px);
    min-height: 420px;
  }

  .annotate-right {
    min-height: 520px;
  }
}

.upload-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.upload-toolbar {
  position: sticky;
  bottom: 0;
  z-index: 8;
  background: var(--bg);
  padding-top: 12px;
  padding-bottom: 8px;
}

.upload-toolbar-meta {
  min-width: 0;
  flex: 1;
}

.upload-toolbar-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
  position: relative;
  z-index: 9;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  max-height: 60vh;
  overflow: auto;
}

.picker-card {
  background: #10182a;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
}

.picker-card:hover {
  outline: 1px solid var(--accent);
}

.picker-card img,
.picker-svg {
  width: 100%;
  height: 110px;
  object-fit: contain;
  background: #0b1220;
  border-radius: 6px;
}

.picker-svg :deep(svg) {
  width: 100%;
  height: 110px;
}

.picker-card span {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  max-height: 2.8em;
  overflow: hidden;
}
</style>
