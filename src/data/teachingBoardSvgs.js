export function buildTeachingSvg({ productName, brand = '', extra = '' }) {
  const scene = [brand && brand !== '__all__' ? brand : '', productName, extra].filter(Boolean).join(' · ')
  const title = `${productName} 教学用控制板示意图`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">
  <rect width="800" height="560" fill="#0b1220"/>
  <rect x="48" y="72" width="704" height="430" rx="12" fill="#16324f" stroke="#3ee0c5" stroke-width="2"/>
  <text x="400" y="44" text-anchor="middle" fill="#e8f1ff" font-size="22" font-family="Microsoft YaHei, sans-serif">${title}</text>
  <text x="400" y="528" text-anchor="middle" fill="#93a7c2" font-size="13" font-family="Microsoft YaHei, sans-serif">${scene || productName} · 原创教学拓扑，不含品牌商标</text>
  <rect x="80" y="110" width="70" height="28" fill="#f5c542"/><text x="115" y="130" text-anchor="middle" font-size="12">AC IN</text>
  <rect x="180" y="104" width="86" height="40" fill="#2a3c57" stroke="#93a7c2"/><text x="223" y="128" text-anchor="middle" fill="#e8f1ff" font-size="12">保险丝</text>
  <rect x="290" y="100" width="100" height="48" fill="#2a3c57" stroke="#3ee0c5"/><text x="340" y="128" text-anchor="middle" fill="#e8f1ff" font-size="12">整流桥</text>
  <circle cx="460" cy="124" r="22" fill="#1b4d89" stroke="#7af0dc"/><text x="460" y="128" text-anchor="middle" fill="#e8f1ff" font-size="11">电容</text>
  <rect x="520" y="96" width="120" height="56" fill="#22385a" stroke="#f5c542"/><text x="580" y="128" text-anchor="middle" fill="#e8f1ff" font-size="12">开关电源</text>
  <rect x="120" y="220" width="160" height="90" rx="8" fill="#10182a" stroke="#3ee0c5"/><text x="200" y="262" text-anchor="middle" fill="#3ee0c5" font-size="16">MCU</text>
  <text x="200" y="286" text-anchor="middle" fill="#93a7c2" font-size="11">主控</text>
  <rect x="320" y="230" width="110" height="70" fill="#10182a" stroke="#93a7c2"/><text x="375" y="270" text-anchor="middle" fill="#e8f1ff" font-size="12">继电器</text>
  <rect x="460" y="230" width="110" height="70" fill="#10182a" stroke="#93a7c2"/><text x="515" y="270" text-anchor="middle" fill="#e8f1ff" font-size="12">驱动</text>
  <rect x="600" y="230" width="110" height="70" fill="#10182a" stroke="#f5c542"/><text x="655" y="270" text-anchor="middle" fill="#e8f1ff" font-size="12">负载口</text>
  <rect x="120" y="360" width="200" height="80" fill="#10182a" stroke="#93a7c2"/><text x="220" y="406" text-anchor="middle" fill="#e8f1ff" font-size="13">采样 / 保护</text>
  <rect x="360" y="360" width="200" height="80" fill="#10182a" stroke="#93a7c2"/><text x="460" y="406" text-anchor="middle" fill="#e8f1ff" font-size="13">显示 / 按键</text>
  <rect x="590" y="360" width="120" height="80" fill="#10182a" stroke="#3ee0c5"/><text x="650" y="406" text-anchor="middle" fill="#e8f1ff" font-size="13">接地</text>
  <line x1="150" y1="138" x2="180" y2="124" stroke="#3ee0c5"/>
  <line x1="266" y1="124" x2="290" y2="124" stroke="#3ee0c5"/>
  <line x1="390" y1="124" x2="438" y2="124" stroke="#3ee0c5"/>
  <line x1="482" y1="124" x2="520" y2="124" stroke="#3ee0c5"/>
  <line x1="200" y1="152" x2="200" y2="220" stroke="#3ee0c5"/>
  <line x1="200" y1="310" x2="200" y2="360" stroke="#3ee0c5"/>
  <line x1="280" y1="265" x2="320" y2="265" stroke="#3ee0c5"/>
  <line x1="430" y1="265" x2="460" y2="265" stroke="#3ee0c5"/>
  <line x1="570" y1="265" x2="600" y2="265" stroke="#3ee0c5"/>
</svg>`
}
