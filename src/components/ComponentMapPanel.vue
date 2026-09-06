<template>
  <section class="map-panel">
    <div class="toolbar" style="margin-top: 0">
      <el-input :model-value="title" size="small" placeholder="标注图标题" style="width: 220px" @update:model-value="$emit('update:title', $event)" />
      <div class="map-actions">
        <el-button size="small" :loading="generating" @click="$emit('generate')">重新生成</el-button>
        <el-button size="small" @click="addLabel">添加文字</el-button>
        <el-button size="small" type="primary" :disabled="!imageUrl" @click="downloadPng">下载图片</el-button>
        <el-button size="small" text @click="$emit('close')">关闭</el-button>
      </div>
    </div>
    <p class="page-desc">
      底图为上传的电路板正面实拍，不会被改画。每次生成后都会复查是否标全、文字与箭头位置是否准确，并把文字排开避免重叠。
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

    <div ref="stageRef" class="map-stage">
      <div v-if="imageUrl" ref="frameRef" class="map-frame">
        <img
          ref="imgRef"
          class="map-base"
          :src="imageUrl"
          alt="电路板标注底图"
          draggable="false"
          @load="onImageLoad"
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
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  imageUrl: { type: String, default: '' },
  generating: { type: Boolean, default: false },
  statusText: { type: String, default: '' },
  title: { type: String, default: '' },
  dividerY: { type: Number, default: null },
  labels: { type: Array, default: () => [] }
})

const emit = defineEmits(['generate', 'close', 'update:labels', 'update:title'])

const stageRef = ref(null)
const frameRef = ref(null)
const imgRef = ref(null)
const selectedIndex = ref(-1)
const box = reactive({ w: 1, h: 1 })
const drag = reactive({
  active: false,
  index: -1,
  mode: 'label'
})

const selected = computed(() =>
  selectedIndex.value >= 0 ? props.labels[selectedIndex.value] : null
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

function syncBox() {
  const el = imgRef.value || frameRef.value
  if (!el) return
  box.w = el.clientWidth || 1
  box.h = el.clientHeight || 1
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
  min-height: 420px;
  background: #0c1220;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-frame {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: 100%;
}

.map-base {
  display: block;
  max-width: 100%;
  max-height: min(72vh, 760px);
  user-select: none;
  pointer-events: none;
}

.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
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
