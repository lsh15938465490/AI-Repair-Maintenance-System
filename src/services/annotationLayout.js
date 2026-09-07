function clampTarget(n) {
  return Math.min(0.98, Math.max(0.02, Number(n) || 0))
}

function clampOuter(n) {
  return Math.min(1.55, Math.max(-0.55, Number(n) || 0))
}

export function textHalfSize(text) {
  const n = Math.max(1, String(text || '元件').length)
  return {
    hw: Math.min(0.24, Math.max(0.03, n * 0.0074)),
    hh: 0.018
  }
}

export function labelAabb(item, pad = 0) {
  const { hw, hh } = textHalfSize(item.text)
  return {
    x1: item.labelX - hw - pad,
    y1: item.labelY - hh - pad,
    x2: item.labelX + hw + pad,
    y2: item.labelY + hh + pad
  }
}

export function labelsOverlap(a, b, pad = 0.004) {
  const A = labelAabb(a, pad)
  const B = labelAabb(b, pad)
  return !(A.x2 < B.x1 || A.x1 > B.x2 || A.y2 < B.y1 || A.y1 > B.y2)
}

function overlapsPhoto(item, gap = 0.008) {
  const a = labelAabb(item, gap)
  return a.x2 > 0 && a.x1 < 1 && a.y2 > 0 && a.y1 < 1
}

function inferSide(tx, ty) {
  const dl = tx
  const dr = 1 - tx
  const dt = ty
  const db = 1 - ty
  const m = Math.min(dl, dr, dt, db)
  if (m === dl) return 'left'
  if (m === dr) return 'right'
  if (m === dt) return 'top'
  return 'bottom'
}

function outsidePos(side, text, along) {
  const { hw, hh } = textHalfSize(text)
  const gap = 0.02
  if (side === 'left') return { labelX: -hw - gap, labelY: along }
  if (side === 'right') return { labelX: 1 + hw + gap, labelY: along }
  if (side === 'top') return { labelX: along, labelY: -hh - gap }
  return { labelX: along, labelY: 1 + hh + gap }
}

function maxRows(pitch) {
  return Math.max(1, Math.floor(1.15 / pitch))
}

function rebalance(buckets, pitch) {
  const cap = maxRows(pitch)
  const order = ['left', 'right', 'top', 'bottom']
  for (const side of order) {
    while (buckets[side].length > cap) {
      const next = order[(order.indexOf(side) + 1) % order.length]
      buckets[next].push(buckets[side].pop())
    }
  }
}

function packVertical(list, side) {
  list.sort((a, b) => a.targetY - b.targetY)
  const lanes = list.length > 14 ? 2 : 1
  const rows = Math.max(1, Math.ceil(list.length / lanes))
  const y0 = 0.05
  const y1 = 0.95
  const pitch = Math.max(0.03, (y1 - y0) / rows)
  list.forEach((item, index) => {
    const lane = index % lanes
    const row = Math.floor(index / lanes)
    const along = y0 + (row + 0.5) * pitch
    const extra = lane * (textHalfSize(item.text).hw * 2 + 0.03)
    const pos = outsidePos(side, item.text, along)
    item.side = side
    item.labelY = clampOuter(pos.labelY)
    item.labelX = clampOuter(side === 'left' ? pos.labelX - extra : pos.labelX + extra)
  })
}

function packHorizontal(list, side) {
  list.sort((a, b) => a.targetX - b.targetX)
  const lanes = list.length > 12 ? 2 : 1
  const cols = Math.max(1, Math.ceil(list.length / lanes))
  const x0 = 0.06
  const x1 = 0.94
  const pitch = Math.max(0.04, (x1 - x0) / cols)
  list.forEach((item, index) => {
    const lane = index % lanes
    const col = Math.floor(index / lanes)
    const along = x0 + (col + 0.5) * pitch
    const extra = lane * (textHalfSize(item.text).hh * 2 + 0.028)
    const pos = outsidePos(side, item.text, along)
    item.side = side
    item.labelX = clampOuter(pos.labelX)
    item.labelY = clampOuter(side === 'top' ? pos.labelY - extra : pos.labelY + extra)
  })
}

export function pushOutsidePhoto(item) {
  const side = item.side || inferSide(item.targetX, item.targetY)
  const along = side === 'left' || side === 'right' ? item.labelY ?? item.targetY : item.labelX ?? item.targetX
  const pos = outsidePos(side, item.text, along)
  const next = { ...item, side, labelX: pos.labelX, labelY: pos.labelY }
  if (side === 'left' && item.labelX != null && item.labelX <= pos.labelX) next.labelX = item.labelX
  if (side === 'right' && item.labelX != null && item.labelX >= pos.labelX) next.labelX = item.labelX
  if (side === 'top' && item.labelY != null && item.labelY <= pos.labelY) next.labelY = item.labelY
  if (side === 'bottom' && item.labelY != null && item.labelY >= pos.labelY) next.labelY = item.labelY
  if (overlapsPhoto(next, 0.012)) {
    const forced = outsidePos(side, item.text, along)
    next.labelX = forced.labelX
    next.labelY = forced.labelY
  }
  return next
}

function resolveCollisions(items) {
  const along = {
    left: [0, 1],
    right: [0, 1],
    top: [1, 0],
    bottom: [1, 0]
  }
  for (let pass = 0; pass < 48; pass += 1) {
    let moved = false
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!labelsOverlap(items[i], items[j], 0.003)) continue
        const b = items[j]
        const dir = along[b.side] || [0, 1]
        const step = 0.02
        const sign = b.targetX + b.targetY >= items[i].targetX + items[i].targetY ? 1 : -1
        b.labelX = clampOuter(b.labelX + dir[0] * step * sign)
        b.labelY = clampOuter(b.labelY + dir[1] * step * sign)
        Object.assign(b, pushOutsidePhoto(b))
        moved = true
      }
    }
    if (!moved) break
  }
  items.forEach((item, i) => {
    Object.assign(items[i], pushOutsidePhoto(item))
  })
  return items
}

export function layoutLabelsNoOverlap(labels) {
  const items = (labels || []).map((item) => ({
    ...item,
    targetX: clampTarget(item.targetX),
    targetY: clampTarget(item.targetY)
  }))
  if (!items.length) return items

  const buckets = { left: [], right: [], top: [], bottom: [] }
  items.forEach((item) => {
    buckets[inferSide(item.targetX, item.targetY)].push(item)
  })
  rebalance(buckets, 0.03)

  packVertical(buckets.left, 'left')
  packVertical(buckets.right, 'right')
  packHorizontal(buckets.top, 'top')
  packHorizontal(buckets.bottom, 'bottom')

  return resolveCollisions(items)
}

export function overlapCount(labels) {
  let n = 0
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (labelsOverlap(labels[i], labels[j])) n += 1
    }
  }
  return n
}
