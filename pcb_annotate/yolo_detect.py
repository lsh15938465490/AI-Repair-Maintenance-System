# -*- coding: utf-8 -*-
"""YOLOv11 只负责元器件定位，输出像素包围框，不做命名。"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import cv2
import numpy as np

LOGGER = logging.getLogger("pcb_annotate.yolo")


def _log(msg: str) -> None:
    LOGGER.info(msg)
    print(msg, file=sys.stderr, flush=True)

DEFAULT_WEIGHTS = "yolo11n.pt"

# ========== 关键调参（更换 PCB 专用训练权重时优先改这里）==========
# conf：置信度阈值，越低越容易检出小电阻/小电容（同时可能多误检，交给 VLM 判断）。
YOLO_CONF_THRESHOLD = 0.18
# iou：NMS 交并比，越低抑制越弱，重叠的相邻小元件更不容易被合并丢掉。
YOLO_IOU = 0.3
# imgsz：推理输入边长，越大对小目标越友好（显存不够时可改回 640）。
YOLO_IMGSZ = 1280
# max_det：单张图最多保留的检测框，PCB 元件多时应调高。
YOLO_MAX_DET = 300
# =================================================================


def _load_model(weights: str | None):
    from ultralytics import YOLO

    path = weights or DEFAULT_WEIGHTS
    LOGGER.info("加载 YOLO 权重: %s", path)
    return YOLO(path)


def save_yolo_debug_preview(image_path: str, detections: list[dict], output_path: str) -> str:
    """
    把全部 YOLO bbox 画在原图副本上并保存（debug_bbox）。
    绿框=检测框，框上标注 id 与置信度，不改写原图文件。
    """
    image_path = str(image_path)
    src = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if src is None:
        raise RuntimeError(f"无法读取图片以生成 YOLO 调试图: {image_path}")
    canvas = src.copy()
    h, w = canvas.shape[:2]
    thickness = max(2, int(min(w, h) * 0.0025))
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = max(0.4, min(w, h) / 900)

    for i, box in enumerate(detections):
        x1 = int(round(min(box["x1"], box["x2"])))
        y1 = int(round(min(box["y1"], box["y2"])))
        x2 = int(round(max(box["x1"], box["x2"])))
        y2 = int(round(max(box["y1"], box["y2"])))
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        cx = int(round((box["x1"] + box["x2"]) / 2.0))
        cy = int(round((box["y1"] + box["y2"]) / 2.0))
        cx = int(np.clip(cx, x1 + 1, max(x1 + 1, x2 - 1)))
        cy = int(np.clip(cy, y1 + 1, max(y1 + 1, y2 - 1)))
        cv2.rectangle(canvas, (x1, y1), (x2, y2), (0, 220, 0), thickness, cv2.LINE_AA)
        arm = max(4, int(min(x2 - x1, y2 - y1) * 0.18))
        cv2.line(canvas, (cx - arm, cy), (cx + arm, cy), (255, 0, 255), thickness, cv2.LINE_AA)
        cv2.line(canvas, (cx, cy - arm), (cx, cy + arm), (255, 0, 255), thickness, cv2.LINE_AA)
        cv2.circle(canvas, (cx, cy), max(3, thickness + 1), (255, 0, 255), -1, cv2.LINE_AA)
        conf = float(box.get("conf") or 0)
        uid = box.get("id") or f"yolo-{i:04d}"
        caption = f"{uid} {conf:.2f}"
        ty = max(16, y1 - 6)
        cv2.putText(canvas, caption, (x1, ty), font, scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
        cv2.putText(canvas, caption, (x1, ty), font, scale, (0, 255, 255), max(1, thickness), cv2.LINE_AA)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(out), canvas):
        raise RuntimeError(f"无法写入 YOLO 调试图: {out}")
    LOGGER.info("已保存 debug_bbox: %s （共 %s 框）", out, len(detections))
    return str(out)


def detect_components(
    image_path: str,
    weights: str | None = None,
    conf: float | None = None,
    iou: float | None = None,
    imgsz: int | None = None,
    max_det: int | None = None,
) -> tuple[list[dict], dict]:
    """
    检测图片中的全部目标，返回像素坐标框 + 统计。

    每项: {id, x1, y1, x2, y2, conf}
    引擎按 conf/iou 完成后，不再二次丢弃低置信/过小框，全部送 VLM。
    """
    image_path = str(image_path)
    if not Path(image_path).is_file():
        raise FileNotFoundError(f"找不到图片: {image_path}")

    # 推理参数：优先函数入参，否则用文件顶部常量（换 PCB 权重时改常量即可）。
    conf_th = YOLO_CONF_THRESHOLD if conf is None else float(conf)
    iou_th = YOLO_IOU if iou is None else float(iou)
    img_size = YOLO_IMGSZ if imgsz is None else int(imgsz)
    maxd = YOLO_MAX_DET if max_det is None else int(max_det)
    model = _load_model(weights)
    results = model.predict(
        source=image_path,
        conf=conf_th,  # YOLO_CONF_THRESHOLD
        iou=iou_th,  # YOLO_IOU
        imgsz=img_size,  # YOLO_IMGSZ
        max_det=maxd,  # YOLO_MAX_DET
        verbose=False,
    )
    empty_stats = {"raw": 0, "after_filter": 0}
    if not results:
        _log("YOLO原始推理得到框总数量: 0")
        _log("经过conf/iou过滤之后剩余候选框数量: 0")
        return [], empty_stats

    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None or len(boxes) == 0:
        LOGGER.warning("YOLO 未检测到目标。若这是电路板特写，请替换为 PCB 训练权重。")
        _log("YOLO原始推理得到框总数量: 0")
        _log("经过conf/iou过滤之后剩余候选框数量: 0")
        return [], empty_stats

    xyxy = boxes.xyxy.cpu().numpy()
    scores = boxes.conf.cpu().numpy() if boxes.conf is not None else np.ones(len(xyxy))
    n_raw = int(len(xyxy))
    detections = []
    for i, row in enumerate(xyxy):
        x1, y1, x2, y2 = [float(v) for v in row]
        score = float(scores[i])
        if x2 < x1:
            x1, x2 = x2, x1
        if y2 < y1:
            y1, y2 = y2, y1
        # 禁止二次丢弃：低置信、过小框全部输出。
        detections.append(
            {
                "id": f"yolo-{i:04d}",
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "conf": score,
            }
        )

    n_keep = len(detections)
    # 本阶段不再二次过滤，after_filter 与引擎 conf/iou 输出一致，全部送 VLM。
    _log(f"YOLO原始推理得到框总数量: {n_raw}")
    _log(f"经过conf/iou过滤之后剩余候选框数量: {n_keep}")
    _log(
        f"YOLO推理参数 conf={conf_th} iou={iou_th} imgsz={img_size} max_det={maxd}（此后不再丢框）"
    )
    return detections, {"raw": n_raw, "after_filter": n_keep}


def crop_detections(
    image: np.ndarray,
    detections: list[dict],
    pad_ratio: float = 0.12,
) -> list[np.ndarray]:
    """按检测框裁剪局部小图，略向外扩边，便于 VLM 看清封装。"""
    h, w = image.shape[:2]
    crops = []
    for box in detections:
        bw = box["x2"] - box["x1"]
        bh = box["y2"] - box["y1"]
        pad_x = bw * pad_ratio
        pad_y = bh * pad_ratio
        x1 = max(0, int(box["x1"] - pad_x))
        y1 = max(0, int(box["y1"] - pad_y))
        x2 = min(w, int(box["x2"] + pad_x))
        y2 = min(h, int(box["y2"] + pad_y))
        crop = image[y1:y2, x1:x2]
        if crop.size == 0:
            crops.append(image)
        else:
            crops.append(crop)
    return crops


if __name__ == "__main__":
    import argparse
    import json

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="仅测试 YOLO 检测")
    parser.add_argument("--image", required=True)
    parser.add_argument("--weights", default=None)
    parser.add_argument("--debug", default=None, help="可选，保存 bbox 预览图路径")
    args = parser.parse_args()
    dets, stats = detect_components(args.image, args.weights)
    if args.debug:
        save_yolo_debug_preview(args.image, dets, args.debug)
    print(json.dumps({"stats": stats, "detections": dets}, ensure_ascii=False, indent=2))
