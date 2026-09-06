<template>
  <div class="wave-wrap">
    <canvas ref="canvasRef" class="wave-canvas" />
    <div v-if="empty" class="wave-empty">无波形数据</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  samples: { type: Array, default: () => [] },
  paused: { type: Boolean, default: false }
})

const canvasRef = ref(null)
const empty = ref(true)
let ro = null
let frozen = []

function paint() {
  const canvas = canvasRef.value
  if (!canvas) return
  const parent = canvas.parentElement
  const w = Math.max(120, parent?.clientWidth || 320)
  const h = Math.max(120, parent?.clientHeight || 180)
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#071018'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#1c3a2a'
  ctx.lineWidth = 1
  const cols = 10
  const rows = 8
  for (let i = 0; i <= cols; i += 1) {
    ctx.beginPath()
    ctx.moveTo((w * i) / cols, 0)
    ctx.lineTo((w * i) / cols, h)
    ctx.stroke()
  }
  for (let j = 0; j <= rows; j += 1) {
    ctx.beginPath()
    ctx.moveTo(0, (h * j) / rows)
    ctx.lineTo(w, (h * j) / rows)
    ctx.stroke()
  }
  ctx.strokeStyle = '#2e6b48'
  ctx.beginPath()
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.stroke()

  const data = props.paused ? frozen : props.samples
  if (!props.paused) frozen = Array.isArray(props.samples) ? [...props.samples] : []
  empty.value = !data?.length
  if (!data?.length) return

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  ctx.beginPath()
  ctx.strokeStyle = '#3ee0c5'
  ctx.lineWidth = 2
  data.forEach((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w
    const y = h - ((v - min) / span) * (h * 0.82) - h * 0.09
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
}

onMounted(() => {
  paint()
  ro = new ResizeObserver(() => paint())
  if (canvasRef.value?.parentElement) ro.observe(canvasRef.value.parentElement)
})

onBeforeUnmount(() => {
  ro?.disconnect()
})

watch(
  () => [props.samples, props.paused],
  () => paint(),
  { deep: true }
)
</script>

<style scoped>
.wave-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 160px;
  background: #071018;
  border: 1px solid #1d3a2c;
  border-radius: 8px;
  overflow: hidden;
}

.wave-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.wave-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7ea48d;
  pointer-events: none;
}
</style>
