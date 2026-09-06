function clamp(n, min = 0.02, max = 0.98) {
  return Math.min(max, Math.max(min, Number(n) || 0))
}

function nearestEdge(tx, ty) {
  const dist = {
    left: tx,
    right: 1 - tx,
    top: ty,
    bottom: 1 - ty
  }
  return Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0]
}

function spread(list, getKey) {
  list.sort((a, b) => getKey(a) - getKey(b))
  const n = list.length
  list.forEach((item, index) => {
    const t = n <= 1 ? 0.5 : (index + 0.6) / (n + 0.2)
    item._slot = 0.05 + t * 0.9
  })
}

export function layoutLabelsNoOverlap(labels) {
  const items = (labels || []).map((item) => ({ ...item }))
  const buckets = { left: [], right: [], top: [], bottom: [] }

  items.forEach((item) => {
    const tx = clamp(item.targetX)
    const ty = clamp(item.targetY)
    item.targetX = tx
    item.targetY = ty
    buckets[nearestEdge(tx, ty)].push(item)
  })

  spread(buckets.left, (item) => item.targetY)
  buckets.left.forEach((item) => {
    item.labelX = 0.035
    item.labelY = item._slot
  })

  spread(buckets.right, (item) => item.targetY)
  buckets.right.forEach((item) => {
    item.labelX = 0.965
    item.labelY = item._slot
  })

  spread(buckets.top, (item) => item.targetX)
  buckets.top.forEach((item) => {
    item.labelY = 0.045
    item.labelX = item._slot
    if (item.labelX > 0.32 && item.labelX < 0.68) {
      item.labelX = item.targetX < 0.5 ? 0.22 : 0.78
    }
  })

  spread(buckets.bottom, (item) => item.targetX)
  buckets.bottom.forEach((item) => {
    item.labelY = 0.955
    item.labelX = item._slot
  })

  return items.map(({ _slot, ...rest }) => rest)
}
