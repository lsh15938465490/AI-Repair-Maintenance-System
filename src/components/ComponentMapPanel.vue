<template>
  <section class="map-panel">
    <div class="toolbar" style="margin-top: 0">
      <el-input :model-value="title" size="small" placeholder="标注图标题" style="width: 220px" @update:model-value="$emit('update:title', $event)" />
      <div class="map-actions">
        <el-button
          size="small"
          class="regen-btn"
          :disabled="generating"
          @click="!generating && $emit('generate')"
        >
          {{ generating ? '正在生成' : '重新生成' }}
        </el-button>
        <el-button size="small" @click="addLabel">添加文字</el-button>
        <el-button size="small" type="primary" :disabled="!imageUrl" @click="downloadPng">下载图片</el-button>
        <el-button size="small" text @click="$emit('close')">关闭</el-button>
      </div>
    </div>
    <p class="page-desc">
      底图为上传的电路板正面实拍，不会被改画或重绘。自动生成优先：YOLOv11 只定位包围框 → Qwen-VL 识别裁剪小图名称 → OpenCV 把红箭头和白描边文字叠到副本并写入 pcb_annotate/output。界面仍可拖动圆点微调箭头、拖动文字改位置。
      <span v-if="statusText"> {{ statusText }}</span>
      <span v-else-if="labels.length"> 当前 {{ labels.length }} 个标注</span>
    </p>

    <div v-if="selected" class="edit-bar">
      <el-input v-model="selected.text" size="small" placeholder="标注文字" style="width: 160px" />
      <label class="color-field">
        文字
        <input v-model="selected.textColor" type="color" />
      </label>
      <label class="color-field">
        线条
        <input v-model="selected.lineColor" type="color" />
      </label>
      <el-button size="small" type="danger" text @click="removeSelected">删除</el-button>
    </div>

    <div class="map-stage-wrap">
    <div ref="stageRef" class="map-stage">
      <div v-if="imageUrl" ref="frameRef" class="map-frame">
        <img
          ref="imgRef"
          class="map-base"
          :src="displaySrc"
          alt="电路板标注底图"
          draggable="false"
          @load="onImageLoad"
          @error="onImageError"
        />
        <svg class="map-svg" :viewBox="`0 0 ${box.w} ${box.h}`" preserveAspectRatio="none">
          <line
            v-if="dividerY != null"
            :x1="0"
            :y1="pctY(dividerY)"
            :x2="box.w"
            :y2="pctY(dividerY)"
            stroke="#e53935"
            stroke-width="2"
            stroke-dasharray="8 6"
          />
          <g v-for="(item, index) in labels" :key="item.id">
            <line
              :x1="pctX(item.labelX)"
              :y1="pctY(item.labelY)"
              :x2="pctX(item.targetX)"
              :y2="pctY(item.targetY)"
              :stroke="item.lineColor || '#e53935'"
              stroke-width="2"
            />
            <polygon :points="arrowHead(item)" :fill="item.lineColor || '#e53935'" />
            <circle
              :cx="pctX(item.targetX)"
              :cy="pctY(item.targetY)"
              r="7"
              fill="#fff"
              :stroke="item.lineColor || '#e53935'"
              stroke-width="2"
              class="handle"
              @pointerdown.stop="startDrag(index, 'target', $event)"
            />
          </g>
        </svg>
        <div
          v-for="(item, index) in labels"
          :key="`${item.id}-text`"
          class="map-label"
          :class="{ active: selectedIndex === index }"
          :style="labelStyle(item)"
          @pointerdown.stop="startDrag(index, 'label', $event)"
        >
          {{ item.text }}
        </div>
        <div v-if="title" class="map-title">{{ title }}</div>
      </div>
      <div v-else class="map-empty">请先在左侧上传电路板正面图</div>
    </div>
    <div v-if="generating" class="map-loading" role="status" aria-live="polite">
      <el-icon class="is-loading map-loading-icon"><Loading /></el-icon>
      <span>{{ statusText || '正在生成标注…' }}</span>
    </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

const props = defineProps({
  imageUrl: { type: String, default: '' },
  generating: { type: Boolean, default: false },
  statusText: { type: String, default: '' },
  title: { type: String, default: '' },
  dividerY: { type: Number, default: null },
  labels: { type: Array, default: () => [] }
})

const emit = defineEmits(['generate', 'close', 'update:labels', 'update:title', 'select'])

const stageRef = ref(null)
const frameRef = ref(null)
const imgRef = ref(null)
const displaySrc = ref('')
const selectedIndex = ref(-1)
let objectUrl = ''

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function toDisplaySrc(src) {
  revokeObjectUrl()
  if (!src) return ''
  if (!String(src).startsWith('data:')) return src
  try {
    const match = String(src).match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!match) return src
    const mime = match[1] || 'image/jpeg'
    const payload = match[3] || ''
    const bytes = match[2]?.includes('base64')
      ? base64ToBytes(payload)
      : new TextEncoder().encode(decodeURIComponent(payload))
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
    return objectUrl
  } catch {
    return src
  }
}

watch(
  () => props.imageUrl,
  (src) => {
    displaySrc.value = toDisplaySrc(src)
  },
  { immediate: true }
)

let resizeObserver = null
onMounted(() => {
  resizeObserver = new ResizeObserver(() => syncBox())
  if (stageRef.value) resizeObserver.observe(stageRef.value)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  revokeObjectUrl()
})
const box = reactive({ w: 1, h: 1 })
const drag = reactive({
  active: false,
  index: -1,
  mode: 'label'
})

const selected = computed(() =>
  selectedIndex.value >= 0 ? props.labels[selectedIndex.value] : null
)

watch(
  selected,
  (item) => {
    emit('select', item || null)
  },
  { deep: true }
)

function clamp(n) {
  return Math.min(1, Math.max(0, n))
}

function pctX(v) {
  return clamp(Number(v) || 0) * box.w
}

function pctY(v) {
  return clamp(Number(v) || 0) * box.h
}

function onImageLoad() {
  syncBox()
}

function onImageError() {
  if (displaySrc.value !== props.imageUrl && props.imageUrl) {
    displaySrc.value = props.imageUrl
    return
  }
  ElMessage.warning('电路板底图无法显示，请返回上传页确认正面图')
}

function syncBox() {
  const img = imgRef.value
  if (!img) return
  if (img.clientWidth < 8 && img.naturalWidth > 8) {
    const stageW = stageRef.value?.clientWidth || 900
    const stageH = Math.min(window.innerHeight * 0.68, 680)
    const scale = Math.min(stageW / img.naturalWidth, stageH / img.naturalHeight, 1)
    img.style.width = `${Math.max(8, Math.round(img.naturalWidth * scale))}px`
    img.style.height = `${Math.max(8, Math.round(img.naturalHeight * scale))}px`
  }
  box.w = img.clientWidth || img.naturalWidth || 1
  box.h = img.clientHeight || img.naturalHeight || 1
}

function labelStyle(item) {
  return {
    left: `${clamp(item.labelX) * 100}%`,
    top: `${clamp(item.labelY) * 100}%`,
    color: item.textColor || '#e53935'
  }
}

function arrowHead(item) {
  const x1 = pctX(item.labelX)
  const y1 = pctY(item.labelY)
  const x2 = pctX(item.targetX)
  const y2 = pctY(item.targetY)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = 12
  const a1 = angle + Math.PI * 0.82
  const a2 = angle - Math.PI * 0.82
  const p1 = `${x2},${y2}`
  const p2 = `${x2 + Math.cos(a1) * len},${y2 + Math.sin(a1) * len}`
  const p3 = `${x2 + Math.cos(a2) * len},${y2 + Math.sin(a2) * len}`
  return `${p1} ${p2} ${p3}`
}

function patchLabel(index, patch) {
  const next = props.labels.map((item, i) => (i === index ? { ...item, ...patch } : item))
  emit('update:labels', next)
}

function startDrag(index, mode, event) {
  selectedIndex.value = index
  drag.active = true
  drag.index = index
  drag.mode = mode
  event.currentTarget.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stopDrag)
}

function onStageDown() {
  selectedIndex.value = -1
}

function onMove(event) {
  if (!drag.active || !imgRef.value) return
  const rect = imgRef.value.getBoundingClientRect()
  const x = clamp((event.clientX - rect.left) / rect.width)
  const y = clamp((event.clientY - rect.top) / rect.height)
  if (drag.mode === 'label') patchLabel(drag.index, { labelX: x, labelY: y })
  else patchLabel(drag.index, { targetX: x, targetY: y })
}

function stopDrag() {
  drag.active = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopDrag)
}

function addLabel() {
  const item = {
    id: `${Date.now()}`,
    text: '新标注',
    labelX: 0.12,
    labelY: 0.12,
    targetX: 0.35,
    targetY: 0.28,
    textColor: '#e53935',
    lineColor: '#e53935'
  }
  emit('update:labels', [...props.labels, item])
  selectedIndex.value = props.labels.length
}

function removeSelected() {
  if (selectedIndex.value < 0) return
  const next = props.labels.filter((_, i) => i !== selectedIndex.value)
  emit('update:labels', next)
  selectedIndex.value = -1
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('底图加载失败'))
    img.src = src
  })
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(2, ctx.canvas.width / 400)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(10, ctx.canvas.width / 80)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 + Math.cos(angle + Math.PI * 0.82) * len, y2 + Math.sin(angle + Math.PI * 0.82) * len)
  ctx.lineTo(x2 + Math.cos(angle - Math.PI * 0.82) * len, y2 + Math.sin(angle - Math.PI * 0.82) * len)
  ctx.closePath()
  ctx.fill()
}

async function downloadPng() {
  if (!props.imageUrl) return
  const img = await loadImage(props.imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  if (props.dividerY != null) {
    ctx.setLineDash([12, 8])
    ctx.strokeStyle = '#e53935'
    ctx.lineWidth = Math.max(2, canvas.width / 400)
    const y = clamp(props.dividerY) * canvas.height
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  const fontSize = Math.max(16, Math.round(canvas.width / 42))
  ctx.font = `bold ${fontSize}px Microsoft YaHei, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (props.title) {
    ctx.fillStyle = '#e53935'
    ctx.fillText(props.title, canvas.width / 2, fontSize * 1.2)
  }
  props.labels.forEach((item) => {
    const lx = clamp(item.labelX) * canvas.width
    const ly = clamp(item.labelY) * canvas.height
    const tx = clamp(item.targetX) * canvas.width
    const ty = clamp(item.targetY) * canvas.height
    drawArrow(ctx, lx, ly, tx, ty, item.lineColor || '#e53935')
    ctx.fillStyle = item.textColor || '#e53935'
    ctx.fillText(item.text || '', lx, ly)
  })
  const link = document.createElement('a')
  link.download = `${props.title || '电路板元件标注'}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  ElMessage.success('已开始下载标注图')
}

defineExpose({ syncBox })
</script>

<style scoped>
.map-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.map-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.regen-btn.is-disabled,
.regen-btn:disabled {
  color: var(--muted) !important;
  cursor: not-allowed;
}

.map-stage-wrap {
  position: relative;
  flex: 1;
  min-height: 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.edit-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.color-field {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.map-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: #0c1220;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: 12px;
  background: rgba(8, 14, 28, 0.62);
  color: #e8eefc;
  font-size: 14px;
  text-align: center;
  padding: 16px;
  pointer-events: all;
}

.map-loading-icon {
  font-size: 42px;
  color: #7eb6ff;
}

.map-frame {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
  background: transparent;
}

.map-base {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(68vh, 720px);
  object-fit: contain;
  vertical-align: top;
  user-select: none;
  pointer-events: none;
  background: transparent;
}

.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: visible;
}

.handle {
  cursor: move;
}

.map-label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-weight: 700;
  font-size: 11px;
  white-space: nowrap;
  text-shadow: 0 0 4px #fff, 0 0 2px #fff;
  cursor: move;
  user-select: none;
  padding: 2px 4px;
}

.map-label.active {
  outline: 1px dashed currentColor;
  background: rgba(255, 255, 255, 0.35);
}

.map-title {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-weight: 700;
  font-size: 18px;
  color: #e53935;
  text-shadow: 0 0 6px #fff;
  pointer-events: none;
}

.map-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
