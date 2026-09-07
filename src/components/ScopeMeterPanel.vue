<template>
  <section class="meter-panel">
    <div class="meter-a">
      <div class="meter-status">
        <span class="lamp" :class="lampClass" />
        <div>
          <strong>{{ deviceId }}</strong>
          <p>{{ statusText }}</p>
        </div>
      </div>
      <div class="meter-battery" v-if="battery != null">电量 {{ battery }}%</div>
      <el-select v-model="meter.transport" size="small" style="width: 120px" :disabled="isLive">
        <el-option label="演示数据" value="demo" />
        <el-option label="WebSocket" value="websocket" />
        <el-option label="HTTP 轮询" value="http" />
      </el-select>
      <el-input
        v-if="meter.transport === 'websocket'"
        v-model="meter.wsUrl"
        size="small"
        placeholder="ws://设备地址"
        style="width: 180px"
        :disabled="isLive"
      />
      <el-input
        v-if="meter.transport === 'http'"
        v-model="meter.httpUrl"
        size="small"
        placeholder="http(s)://轮询地址"
        style="width: 180px"
        :disabled="isLive"
      />
      <el-button size="small" type="primary" :disabled="isLive" @click="meter.connect()">连接</el-button>
      <el-button size="small" :disabled="!isLive && meter.connection === 'offline'" @click="meter.disconnect()">
        断开
      </el-button>
    </div>
    <p v-if="errorBar" class="meter-error">{{ errorBar }}</p>
    <p v-if="selectedLabel" class="meter-link">当前元件：{{ selectedLabel }}</p>

    <div class="meter-b">
      <div class="gear-name">{{ gearName }}</div>
      <div class="digit" :class="{ ol: overload }">
        <span class="num">{{ reading.text }}</span>
        <span class="unit">{{ reading.unit }}</span>
      </div>
    </div>

    <div class="meter-c" :class="{ emphasize: !showWave }">
      <div class="icon-card" :class="{ blink: blinkBeep, dim: packet?.gear_type !== 'beep' }">
        <span class="icon">📢</span>
        <span>蜂鸣</span>
      </div>
      <div class="icon-card" :class="{ blink: blinkDiode, dim: packet?.gear_type !== 'diode' }">
        <span class="icon">➡️</span>
        <span>二极管</span>
      </div>
      <div class="icon-card" :class="{ blink: blinkAlarm, dim: !overload }">
        <span class="icon">⚡</span>
        <span>过压告警</span>
      </div>
    </div>

    <div v-if="showWave" class="meter-d">
      <ScopeWaveCanvas :samples="waveSamples" :paused="meter.paused" />
      <div class="wave-meta">
        <span>V/div：{{ packet?.wave_v_div || '--' }}</span>
        <span>T/div：{{ packet?.wave_t_div || '--' }}</span>
        <span>采样率：{{ packet?.wave_sample_rate ? `${packet.wave_sample_rate} S/s` : '--' }}</span>
        <el-button size="small" text @click="meter.togglePause()">
          {{ meter.paused ? '继续' : '暂停' }}
        </el-button>
      </div>
    </div>
    <div v-else class="meter-d placeholder">当前档位不绘制波形</div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useMeterStore } from '@/stores/meter'
import { formatReading, gearLabel, isOverload, shouldRenderWave } from '@/data/meterProtocol'
import ScopeWaveCanvas from '@/components/ScopeWaveCanvas.vue'

defineProps({
  selectedLabel: { type: String, default: '' }
})

const meter = useMeterStore()
const packet = computed(() => meter.livePacket)
const isLive = computed(() => meter.connection === 'online' || meter.connection === 'connecting')
const deviceId = computed(() => packet.value?.device_id || '示波万用表')
const battery = computed(() => packet.value?.battery)
const gearName = computed(() => gearLabel(packet.value?.gear_type))
const reading = computed(() => formatReading(packet.value))
const overload = computed(() => isOverload(packet.value))
const showWave = computed(() => shouldRenderWave(packet.value))
const waveSamples = computed(() => packet.value?.wave_data || [])
const blinkBeep = computed(() => !meter.frozen && packet.value?.gear_type === 'beep' && packet.value?.is_trigger)
const blinkDiode = computed(() => !meter.frozen && packet.value?.gear_type === 'diode' && packet.value?.is_trigger)
const blinkAlarm = computed(() => !meter.frozen && overload.value)
const lampClass = computed(() => {
  if (meter.connection === 'online') return 'ok'
  if (meter.connection === 'error' || packet.value?.device_status === 'error') return 'warn'
  return 'off'
})
const statusText = computed(() => {
  if (meter.connection === 'connecting') return '正在连接'
  if (meter.connection === 'online') return meter.frozen ? '已冻结' : '已连接'
  if (meter.connection === 'error') return '数据异常'
  return '断开'
})
const errorBar = computed(() => meter.statusMessage || (overload.value ? '超量程' : ''))
</script>

<style scoped>
.meter-panel {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: linear-gradient(180deg, #151c16, #0e1410);
  border: 1px solid #2a4634;
  border-radius: 12px;
  color: #d7f5dd;
}

.meter-a {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.meter-status {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 140px;
}

.meter-status p {
  margin: 0;
  font-size: 12px;
  color: #8fb39a;
}

.lamp {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #c62828;
  box-shadow: 0 0 8px #c62828;
}

.lamp.ok {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.lamp.warn {
  background: #f5c542;
  box-shadow: 0 0 8px #f5c542;
}

.meter-battery {
  font-size: 12px;
  color: #9ec9ad;
}

.meter-error {
  margin: 0;
  color: #ffb4a2;
  font-size: 12px;
}

.meter-link {
  margin: 0;
  font-size: 12px;
  color: #3ee0c5;
}

.meter-b {
  background: #050a07;
  border-radius: 10px;
  padding: 12px 14px;
  border: 1px solid #1f3d2a;
}

.gear-name {
  font-size: 13px;
  color: #8fb39a;
  margin-bottom: 4px;
}

.digit {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: "Consolas", "DIN Alternate", "Segoe UI", monospace;
}

.digit .num {
  font-size: 42px;
  line-height: 1;
  letter-spacing: 1px;
  color: #7cff9a;
}

.digit.ol .num {
  color: #ff6b6b;
}

.digit .unit {
  font-size: 18px;
  color: #9ec9ad;
}

.meter-c {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.meter-c.emphasize .icon-card {
  min-height: 76px;
}

.icon-card {
  background: #101a14;
  border: 1px solid #2a4634;
  border-radius: 8px;
  padding: 8px 6px;
  text-align: center;
  font-size: 12px;
  color: #b7dcc4;
}

.icon-card .icon {
  display: block;
  font-size: 22px;
  margin-bottom: 4px;
}

.icon-card.dim {
  opacity: 0.45;
}

.icon-card.blink {
  opacity: 1;
  animation: meter-blink 0.5s linear infinite;
}

.meter-d {
  flex: 1;
  min-height: 0;
}

.meter-d.placeholder {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7ea48d;
  border: 1px dashed #2a4634;
  border-radius: 8px;
}

.wave-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: #8fb39a;
}

@keyframes meter-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
</style>
