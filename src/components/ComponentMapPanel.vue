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

    <div class="map-body">
    <div class="map-stage-wrap">
    <div ref="stageRef" class="map-stage">
      <div v-if="imageUrl" ref="frameRef" class="map-frame" :style="frameStyle">
        <img
          ref="imgRef"
          class="map-base"
          :src="displaySrc"
          alt="电路板标注底图"
          draggable="false"
          @load="onImageLoad"
          @error="onImageError"
        />
        <svg class="map-svg" :viewBox="`0 0 ${frameW} ${frameH}`" preserveAspectRatio="none">
          <line
            v-if="dividerY != null"
            :x1="0"
            :y1="pctY(dividerY, true)"
            :x2="frameW"
            :y2="pctY(dividerY, true)"
            stroke="#e53935"
            stroke-width="2"
            stroke-dasharray="8 6"
          />
          <g
            v-for="(item, index) in labels"
            :key="item.id"
            class="anno-mark"
            :class="{ 'is-flashing': flashIndex === index }"
          >
            <polyline
              :points="leaderPoints(item)"
              fill="none"
              :stroke="item.lineColor || '#e53935'"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <polygon :points="arrowHead(item)" :fill="item.lineColor || '#e53935'" />
            <circle
              :cx="pctX(item.targetX, true)"
              :cy="pctY(item.targetY, true)"
              r="6"
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
          :class="{ active: selectedIndex === index, 'is-flashing': flashIndex === index }"
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
    <aside class="component-table-panel" @wheel.stop>
      <div class="component-table-head">
        <strong>元器件列表</strong>
        <span v-if="!generating && labels.length">共 {{ labels.length }} 个元器件</span>
        <span v-else-if="generating">识别中…</span>
        <span v-else>标注完成后显示</span>
      </div>
      <div v-if="!generating && componentRows.length" class="component-table-wrap">
        <el-table
          :data="componentRows"
          height="100%"
          size="small"
          highlight-current-row
          :row-class-name="tableRowClass"
          @row-click="onTableRowClick"
        >
          <el-table-column type="index" label="#" width="48" />
          <el-table-column prop="name" label="名字" min-width="88" show-overflow-tooltip />
          <el-table-column prop="function" label="功能" min-width="120" show-overflow-tooltip />
        </el-table>
      </div>
      <p v-else class="component-table-empty">
        {{ generating ? '正在识别元器件，完成后将列出名称与功能' : '标注完成后将在此列出元器件名称与功能' }}
      </p>
    </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { pushOutsidePhoto } from '@/services/annotationLayout'

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
const flashIndex = ref(-1)
let flashTimer = 0
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
  window.clearTimeout(flashTimer)
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

function calcFramePad(imgW, imgH, labels) {
  const w = Math.max(1, imgW)
  const h = Math.max(1, imgH)
  let left = w * 0.16
  let right = w * 0.16
  let top = h * 0.1
  let bottom = h * 0.1
  for (const item of labels || []) {
    const n = Math.max(1, String(item.text || '').length)
    const hw = Math.min(0.24, Math.max(0.03, n * 0.0075)) * w
    const hh = 0.02 * h
    const lx = Number(item.labelX) || 0
    const ly = Number(item.labelY) || 0
    left = Math.max(left, hw - lx * w + 12)
    right = Math.max(right, lx * w + hw - w + 12)
    top = Math.max(top, hh - ly * h + 12)
    bottom = Math.max(bottom, ly * h + hh - h + 12)
  }
  return {
    left: Math.ceil(Math.max(64, left)),
    right: Math.ceil(Math.max(64, right)),
    top: Math.ceil(Math.max(40, top)),
    bottom: Math.ceil(Math.max(40, bottom))
  }
}

const framePad = computed(() => calcFramePad(box.w, box.h, props.labels))

const frameStyle = computed(() => ({
  padding: `${framePad.value.top}px ${framePad.value.right}px ${framePad.value.bottom}px ${framePad.value.left}px`
}))

const frameW = computed(() => box.w + framePad.value.left + framePad.value.right)
const frameH = computed(() => box.h + framePad.value.top + framePad.value.bottom)

watch(
  selected,
  (item) => {
    emit('select', item || null)
  },
  { deep: true }
)

watch(
  () => props.labels.length,
  () => {
    syncBox()
  }
)

function splitLabel(item) {
  const rawName = String(item?.name || item?.component_name || '').trim()
  const rawFn = String(item?.function || item?.function_desc || '').trim()
  if (rawName || rawFn) {
    return { name: rawName || String(item?.text || '未命名'), function: rawFn }
  }
  const text = String(item?.text || '').trim()
  const mark = text.includes('、') ? '、' : text.includes('，') ? '，' : ''
  if (mark) {
    const at = text.indexOf(mark)
    return {
      name: text.slice(0, at).trim() || '未命名',
      function: text.slice(at + mark.length).trim()
    }
  }
  return { name: text || '未命名', function: '' }
}

const componentRows = computed(() =>
  (props.labels || []).map((item, index) => {
    const parts = splitLabel(item)
    return {
      index,
      id: item.id,
      name: parts.name,
      function: parts.function || '—'
    }
  })
)

function tableRowClass({ rowIndex }) {
  return rowIndex === selectedIndex.value ? 'is-active-row' : ''
}

function onTableRowClick(row) {
  selectedIndex.value = row.index
  startFlash(row.index)
}

function startFlash(index) {
  window.clearTimeout(flashTimer)
  flashIndex.value = -1
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flashIndex.value = index
    })
  })
  flashTimer = window.setTimeout(() => {
    if (flashIndex.value === index) flashIndex.value = -1
  }, 1100)
}

function clamp(n) {
  return Math.min(1, Math.max(0, n))
}

function pctX(v, asTarget = false) {
  const n = Number(v) || 0
  const x = asTarget ? clamp(n) : n
  return framePad.value.left + x * box.w
}

function pctY(v, asTarget = false) {
  const n = Number(v) || 0
  const y = asTarget ? clamp(n) : n
  return framePad.value.top + y * box.h
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
  const stage = stageRef.value
  if (!img) return
  const nw = img.naturalWidth || 0
  const nh = img.naturalHeight || 0
  if (nw < 8 || nh < 8) {
    box.w = img.clientWidth || 1
    box.h = img.clientHeight || 1
    return
  }
  const sw = Math.max(80, (stage?.clientWidth || 900) - 8)
  const sh = Math.max(80, (stage?.clientHeight || 480) - 8)
  let scale = Math.min(sw / nw, sh / nh, 1)
  for (let i = 0; i < 4; i += 1) {
    const w = nw * scale
    const h = nh * scale
    const pad = calcFramePad(w, h, props.labels)
    const fit = Math.min(sw / (w + pad.left + pad.right), sh / (h + pad.top + pad.bottom), 1)
    scale *= fit
    if (fit > 0.997) break
  }
  const nextW = Math.max(8, Math.round(nw * scale))
  const nextH = Math.max(8, Math.round(nh * scale))
  const wCss = `${nextW}px`
  const hCss = `${nextH}px`
  if (img.style.width !== wCss || img.style.height !== hCss) {
    img.style.maxWidth = 'none'
    img.style.maxHeight = 'none'
    img.style.width = wCss
    img.style.height = hCss
  }
  box.w = nextW
  box.h = nextH
}

function labelStyle(item) {
  return {
    left: `${pctX(item.labelX)}px`,
    top: `${pctY(item.labelY)}px`,
    color: item.textColor || '#e53935'
  }
}

function inferSide(item) {
  if (item.side) return item.side
  const tx = clamp(item.targetX)
  const ty = clamp(item.targetY)
  const lx = Number(item.labelX) || 0
  const ly = Number(item.labelY) || 0
  const dx = Math.abs(lx - tx)
  const dy = Math.abs(ly - ty)
  if (dx >= dy) return lx < tx ? 'left' : 'right'
  return ly < ty ? 'top' : 'bottom'
}

function elbowOf(item) {
  const side = inferSide(item)
  if (side === 'left' || side === 'right') {
    return { x: pctX(item.labelX), y: pctY(item.targetY, true) }
  }
  return { x: pctX(item.targetX, true), y: pctY(item.labelY) }
}

function leaderPoints(item) {
  const x1 = pctX(item.labelX)
  const y1 = pctY(item.labelY)
  const mid = elbowOf(item)
  const x2 = pctX(item.targetX, true)
  const y2 = pctY(item.targetY, true)
  return `${x1},${y1} ${mid.x},${mid.y} ${x2},${y2}`
}

function arrowHead(item) {
  const mid = elbowOf(item)
  const x2 = pctX(item.targetX, true)
  const y2 = pctY(item.targetY, true)
  const angle = Math.atan2(y2 - mid.y, x2 - mid.x)
  const len = 11
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
  if (!drag.active || !imgRef.value || !frameRef.value) return
  const frame = frameRef.value.getBoundingClientRect()
  const pad = framePad.value
  const x = (event.clientX - frame.left - pad.left) / Math.max(1, box.w)
  const y = (event.clientY - frame.top - pad.top) / Math.max(1, box.h)
  if (drag.mode === 'label') {
    const item = props.labels[drag.index]
    const next = pushOutsidePhoto({ ...item, labelX: x, labelY: y, side: item.side })
    patchLabel(drag.index, { labelX: next.labelX, labelY: next.labelY, side: next.side })
  } else patchLabel(drag.index, { targetX: clamp(x), targetY: clamp(y) })
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
    name: '新标注',
    function: '',
    labelX: -0.08,
    labelY: 0.2,
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
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  let pl = nw * 0.16
  let pr = nw * 0.16
  let pt = nh * 0.1
  let pb = nh * 0.1
  props.labels.forEach((item) => {
    const n = Math.max(1, String(item.text || '').length)
    const hw = Math.min(0.24, Math.max(0.03, n * 0.0075)) * nw
    const hh = 0.02 * nh
    const lx = Number(item.labelX) || 0
    const ly = Number(item.labelY) || 0
    pl = Math.max(pl, hw - lx * nw + 16)
    pr = Math.max(pr, lx * nw + hw - nw + 16)
    pt = Math.max(pt, hh - ly * nh + 16)
    pb = Math.max(pb, ly * nh + hh - nh + 16)
  })
  pl = Math.ceil(Math.max(80, pl))
  pr = Math.ceil(Math.max(80, pr))
  pt = Math.ceil(Math.max(48, pt))
  pb = Math.ceil(Math.max(48, pb))
  const canvas = document.createElement('canvas')
  canvas.width = nw + pl + pr
  canvas.height = nh + pt + pb
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f4f6fa'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, pl, pt)
  if (props.dividerY != null) {
    ctx.setLineDash([12, 8])
    ctx.strokeStyle = '#e53935'
    ctx.lineWidth = Math.max(2, nw / 400)
    const y = pt + clamp(props.dividerY) * nh
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  const fontSize = Math.max(16, Math.round(nw / 42))
  ctx.font = `bold ${fontSize}px Microsoft YaHei, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (props.title) {
    ctx.fillStyle = '#e53935'
    ctx.fillText(props.title, canvas.width / 2, pt * 0.45)
  }
  props.labels.forEach((item) => {
    const lx = pl + Number(item.labelX) * nw
    const ly = pt + Number(item.labelY) * nh
    const tx = pl + clamp(item.targetX) * nw
    const ty = pt + clamp(item.targetY) * nh
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

.page-desc {
  flex-shrink: 0;
}

.map-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 12px;
  overflow: hidden;
}

.regen-btn.is-disabled,
.regen-btn:disabled {
  color: var(--muted) !important;
  cursor: not-allowed;
}

.map-stage-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.component-table-panel {
  flex: 0 0 360px;
  width: 360px;
  min-width: 300px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #10182a;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.component-table-head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 8px;
  color: var(--text);
}

.component-table-head span {
  color: var(--muted);
  font-size: 13px;
}

.component-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 8px 10px;
}

.component-table-empty {
  margin: 0;
  padding: 16px 14px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.component-table-panel :deep(.el-table) {
  --el-table-bg-color: #10182a;
  --el-table-tr-bg-color: #10182a;
  --el-table-header-bg-color: #162238;
  --el-table-text-color: var(--text);
  --el-table-header-text-color: var(--muted);
  --el-table-border-color: var(--line);
  --el-table-row-hover-bg-color: #1c2a44;
  background: #10182a;
}

.component-table-panel :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

.component-table-panel :deep(.is-active-row > td.el-table__cell) {
  background: rgba(62, 224, 197, 0.12) !important;
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
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
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
  line-height: 0;
  background: #f4f6fa;
  border-radius: 8px;
  flex-shrink: 0;
}

.map-base {
  display: block;
  width: auto;
  height: auto;
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

.anno-mark.is-flashing {
  animation: annotate-flash 0.36s ease-in-out 3;
}

.anno-mark.is-flashing circle {
  filter: drop-shadow(0 0 7px currentColor);
}

.map-label.is-flashing {
  animation: annotate-flash 0.36s ease-in-out 3;
  outline: 2px solid currentColor;
  background: rgba(255, 255, 255, 0.55);
}

@keyframes annotate-flash {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.12;
  }
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
