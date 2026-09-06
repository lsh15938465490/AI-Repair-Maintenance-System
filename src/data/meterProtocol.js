export const GEAR_LABELS = {
  dcv: 'DC电压',
  acv: 'AC电压',
  osc: '示波器模式',
  beep: '蜂鸣通断档',
  diode: '二极管档',
  resistance: '电阻档',
  cap: '电容档',
  current_ac: '交流电流',
  current_dc: '直流电流'
}

export const WAVE_GEARS = new Set(['osc', 'acv', 'dcv'])
export const ICON_GEARS = new Set(['beep', 'diode', 'resistance', 'cap', 'current_ac', 'current_dc'])

export const ERROR_TEXT = {
  0: '',
  1: '超量程',
  2: '探头异常',
  3: '设备过热',
  4: '数据异常'
}

export function gearLabel(type) {
  return GEAR_LABELS[type] || type || '未知档位'
}

export function shouldRenderWave(packet) {
  if (!packet) return false
  if (packet.wave_enable === false) return false
  if (packet.wave_enable === true) return true
  return WAVE_GEARS.has(packet.gear_type)
}

export function isOverload(packet) {
  if (!packet) return false
  if (packet.error_code === 1 || packet.ol === true || packet.overload === true) return true
  const value = packet.measure_value
  if (value === 'OL' || value === 'ol') return true
  return false
}

export function formatReading(packet) {
  if (!packet) return { text: '--', unit: '' }
  if (isOverload(packet)) return { text: 'OL', unit: packet.measure_unit || '' }
  const value = packet.measure_value
  if (value == null || value === '') return { text: '--', unit: packet.measure_unit || '' }
  const num = Number(value)
  if (!Number.isFinite(num)) return { text: String(value), unit: packet.measure_unit || '' }
  const abs = Math.abs(num)
  let text = String(num)
  if (abs >= 1000) text = num.toFixed(1)
  else if (abs >= 100) text = num.toFixed(2)
  else if (abs >= 1) text = num.toFixed(3)
  else if (abs >= 0.001) text = num.toFixed(4)
  else text = num.toExponential(2)
  return { text, unit: packet.measure_unit || '' }
}

export function errorMessage(code) {
  if (code == null || code === 0) return ''
  return ERROR_TEXT[code] || `设备错误 ${code}`
}

export function validatePacket(raw) {
  if (!raw || typeof raw !== 'object') return null
  const gear = String(raw.gear_type || '').trim()
  if (!gear && raw.measure_value == null && !Array.isArray(raw.wave_data)) {
    return null
  }
  const wave = Array.isArray(raw.wave_data)
    ? raw.wave_data.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : []
  return {
    device_status: ['online', 'offline', 'error'].includes(raw.device_status)
      ? raw.device_status
      : 'online',
    device_id: String(raw.device_id || raw.deviceId || 'SCOPE-MM-01'),
    gear_type: gear || 'dcv',
    measure_value: raw.measure_value,
    measure_unit: String(raw.measure_unit || ''),
    is_trigger: Boolean(raw.is_trigger),
    battery: Number.isFinite(Number(raw.battery)) ? Math.max(0, Math.min(100, Number(raw.battery))) : null,
    wave_enable: raw.wave_enable,
    wave_data: wave,
    wave_sample_rate: Number(raw.wave_sample_rate) || 0,
    wave_v_div: String(raw.wave_v_div || ''),
    wave_t_div: String(raw.wave_t_div || ''),
    error_code: Number(raw.error_code) || 0,
    ol: Boolean(raw.ol || raw.overload),
    ts: Date.now()
  }
}
