export function buildDemoPacket(demoT) {
  const cycle = Math.floor(demoT / 2.5) % 6
  const battery = 78
  if (cycle === 0) {
    const wave = Array.from({ length: 180 }, (_, i) => Math.sin(i / 8 + demoT) * 1.2)
    return {
      device_status: 'online',
      device_id: 'SCOPE-MM-DEMO',
      gear_type: 'osc',
      measure_value: 1.2,
      measure_unit: 'V',
      is_trigger: false,
      battery,
      wave_enable: true,
      wave_data: wave,
      wave_sample_rate: 10000,
      wave_v_div: '1V/div',
      wave_t_div: '1ms/div',
      error_code: 0
    }
  }
  if (cycle === 1) {
    const on = Math.sin(demoT * 3) > 0
    return {
      device_status: 'online',
      device_id: 'SCOPE-MM-DEMO',
      gear_type: 'beep',
      measure_value: on ? 0.2 : 1e7,
      measure_unit: 'Ω',
      is_trigger: on,
      battery,
      wave_enable: false,
      wave_data: [],
      error_code: 0
    }
  }
  if (cycle === 2) {
    return {
      device_status: 'online',
      device_id: 'SCOPE-MM-DEMO',
      gear_type: 'diode',
      measure_value: 0.62,
      measure_unit: 'V',
      is_trigger: true,
      battery,
      wave_enable: false,
      wave_data: [],
      error_code: 0
    }
  }
  if (cycle === 3) {
    return {
      device_status: 'online',
      device_id: 'SCOPE-MM-DEMO',
      gear_type: 'resistance',
      measure_value: 4.7e3,
      measure_unit: 'Ω',
      is_trigger: false,
      battery,
      wave_enable: false,
      wave_data: [],
      error_code: 0
    }
  }
  if (cycle === 4) {
    return {
      device_status: 'online',
      device_id: 'SCOPE-MM-DEMO',
      gear_type: 'dcv',
      measure_value: 'OL',
      measure_unit: 'V',
      is_trigger: false,
      battery,
      wave_enable: true,
      wave_data: [],
      wave_v_div: '10V/div',
      wave_t_div: '1ms/div',
      error_code: 1
    }
  }
  const wave = Array.from({ length: 180 }, (_, i) => 5 + Math.sin(i / 10 + demoT) * 0.15)
  return {
    device_status: 'online',
    device_id: 'SCOPE-MM-DEMO',
    gear_type: 'dcv',
    measure_value: 5.02,
    measure_unit: 'V',
    is_trigger: false,
    battery,
    wave_enable: true,
    wave_data: wave,
    wave_sample_rate: 8000,
    wave_v_div: '2V/div',
    wave_t_div: '2ms/div',
    error_code: 0
  }
}
