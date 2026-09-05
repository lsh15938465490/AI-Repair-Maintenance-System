<template>
  <div>
    <h2 class="page-title">维修识别</h2>
    <p class="page-desc">上传电路板正反面实拍图（必填），可选上传原理图。识别前将校验图片与 API 配置。</p>

    <div class="upload-grid">
      <section class="panel upload-card">
        <h3>电路板正面实拍图（必填）</h3>
        <p class="page-desc">支持 jpg / png / jpeg</p>
        <el-upload
          :show-file-list="false"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          :auto-upload="false"
          :on-change="(file) => onImageChange('front', file)"
        >
          <span class="el-button el-button--primary">上传正面图</span>
        </el-upload>
        <div class="preview-box" style="margin-top: 12px">
          <img v-if="frontUrl" :src="frontUrl" alt="正面图" />
          <span v-else>尚未上传</span>
        </div>
      </section>

      <section class="panel upload-card">
        <h3>电路板反面实拍图（必填）</h3>
        <p class="page-desc">支持 jpg / png / jpeg</p>
        <el-upload
          :show-file-list="false"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          :auto-upload="false"
          :on-change="(file) => onImageChange('back', file)"
        >
          <span class="el-button el-button--primary">上传反面图</span>
        </el-upload>
        <div class="preview-box" style="margin-top: 12px">
          <img v-if="backUrl" :src="backUrl" alt="反面图" />
          <span v-else>尚未上传</span>
        </div>
      </section>

      <section class="panel upload-card">
        <h3>电路原理图（选填）</h3>
        <p class="page-desc">支持图片或 PDF，不上传也可识别</p>
        <el-upload
          :show-file-list="false"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          :auto-upload="false"
          :on-change="onSchematicChange"
        >
          <span class="el-button">上传原理图</span>
        </el-upload>
        <el-button v-if="schematicUrl" text type="danger" @click="clearSchematic">清除原理图</el-button>
        <div class="preview-box" style="margin-top: 12px">
          <img v-if="schematicUrl" :src="schematicUrl" alt="原理图" />
          <span v-else>未上传（不影响识别）</span>
        </div>
      </section>
    </div>

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
      <h4>故障点位与原因</h4>
      <div v-if="result.faults?.length">
        <div v-for="(item, index) in result.faults" :key="index" class="fault-item">
          <strong>{{ item.location }} · {{ item.type }}</strong>
          <p>{{ item.reason }}</p>
        </div>
      </div>
      <p v-else>未给出明确故障点位。</p>
      <h4>分步维修排查与修复步骤</h4>
      <div v-for="(step, index) in result.repairSteps || []" :key="index" class="step-item">
        <strong>{{ index + 1 }}. {{ step.title }}</strong>
        <p>{{ step.content }}</p>
      </div>
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
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useRepairStore } from '@/stores/repair'
import { getProvider } from '@/services/providers'
import { analyzeBoard } from '@/services/ai'
import {
  compressImage,
  fileToDataUrl,
  isAllowedImage,
  isAllowedSchematic,
  pdfToImageDataUrl
} from '@/utils/files'

const router = useRouter()
const settings = useSettingsStore()
const repairStore = useRepairStore()
const loading = ref(false)
const frontUrl = ref('')
const backUrl = ref('')
const schematicUrl = ref('')
const result = ref(null)

const providerName = computed(() => getProvider(settings.currentProvider).name)

async function onImageChange(side, uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (!isAllowedImage(file)) {
    ElMessage.warning('仅支持 jpg、png、jpeg 格式')
    return
  }
  const dataUrl = await fileToDataUrl(file)
  const compressed = await compressImage(dataUrl)
  if (side === 'front') frontUrl.value = compressed
  else backUrl.value = compressed
}

async function onSchematicChange(uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (!isAllowedSchematic(file)) {
    ElMessage.warning('原理图仅支持图片或 PDF')
    return
  }
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    schematicUrl.value = await pdfToImageDataUrl(file)
  } else {
    schematicUrl.value = await compressImage(await fileToDataUrl(file))
  }
}

function clearSchematic() {
  schematicUrl.value = ''
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
    '故障点位：',
    faults || '无',
    '维修步骤：',
    steps || '无'
  ].join('\n')
}

async function copyAll() {
  if (!result.value) return
  await navigator.clipboard.writeText(buildFullText(result.value))
  ElMessage.success('已复制全文')
}

async function startAnalyze() {
  if (!frontUrl.value || !backUrl.value) {
    await ElMessageBox.alert(
      '请先上传电路板正反两面实拍图片，再进行识别',
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

  loading.value = true
  try {
    const images = [frontUrl.value, backUrl.value]
    if (schematicUrl.value) images.push(schematicUrl.value)
    const data = await analyzeBoard({
      providerId: settings.currentProvider,
      apiKey: settings.currentKey,
      images,
      hasSchematic: Boolean(schematicUrl.value)
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
