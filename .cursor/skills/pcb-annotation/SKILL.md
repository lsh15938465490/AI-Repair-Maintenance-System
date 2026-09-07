---
name: pcb-annotation
description: >-
  Enforces full PCB component annotation quality: every part labeled, arrow
  targets on the component center, no overlapping label text, and a review pass
  after every generation. Use when changing 元件标注图, annotateComponents,
  pcb-annotation.md, annotationLayout, or ComponentMapPanel.
---

# 电路板元件标注质检

生成后端优先使用 `pcb_annotate/`（YOLOv11 定位、VLM 命名、OpenCV 只叠加箭头文字）。全图 VLM 路径仅作回退。

运行时提示词：

- VLM 元件识别系统提示词 `src/skills/pcb-vlm-component.md`（每次把标注图片发给模型时作为 system）
- 首次全图标注 `src/skills/pcb-annotation.md`
- 复查 `src/skills/pcb-annotation-review.md`
- 文字避让由 `src/services/annotationLayout.js` 在每一轮之后执行

改标注逻辑时不要在 `ai.js` 另写一套冲突规则。

## 每次识别完成后必须复查

循环直到通过或达到轮次上限：

1. 是否标注完成（全量可见元件）
2. 文字是否准确（名称/位号与元件一致）
3. 位置是否准确（箭头终点在元件中心）
4. 文字是否重叠（由程序把标签排到四边，禁止叠字）

未通过则补标 `missing`、纠正 `corrections`，然后再次复查。

## 位置规则

- `targetX/targetY` 只表示元件中心，禁止指到相邻器件
- `labelX/labelY` 放在板外四边，按目标点远近分配左右上下，同列均匀错开
- 底图实拍图不得重绘

## 改代码时

1. 提示词只维护上述两个 md
2. 合并新标注后必须再跑 `layoutLabelsNoOverlap`
3. 复查 JSON 的 complete/accurate 都为 true 才可结束
