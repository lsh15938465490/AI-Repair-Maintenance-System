# -*- coding: utf-8 -*-
"""
电路板元器件自动标注入口。

流水线：YOLOv11 定位 → 裁剪小图 → Qwen-VL 命名 → OpenCV 叠加红箭头标签。
原图像素文件不会被改写，成品只写入 output 目录。

调用示例：

    python main.py --image board.jpg
    python main.py --image board.jpg --weights weights/pcb.pt --output-dir output --json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import cv2

from draw_annotate import annotate_image
from vlm_recognize import FALLBACK_NAME, format_label, log_vlm_stats, recognize_crop, resolve_api_key
from yolo_detect import (
    YOLO_CONF_THRESHOLD,
    YOLO_IMGSZ,
    YOLO_IOU,
    YOLO_MAX_DET,
    crop_detections,
    detect_components,
    save_yolo_debug_preview,
)

LOGGER = logging.getLogger("pcb_annotate")


def count_log(stage: str, n: int) -> None:
    msg = f"[数量追踪] {stage}: {n}"
    LOGGER.info(msg)
    print(msg, file=sys.stderr, flush=True)


def print_summary(
    yolo_n: int,
    vlm_n: int,
    vlm_ok: int,
    vlm_fb: int,
    draw_n: int,
    render_n: int,
    missing_ids: list[str] | None = None,
) -> None:
    lines = [
        "=====元器件统计汇总=====",
        f"YOLO输出候选框总数：{yolo_n}",
        f"送入VLM元件总数：{vlm_n}",
        f"VLM成功解析：{vlm_ok}，VLM兜底未知元件：{vlm_fb}",
        f"最终图片上渲染标注元件总数：{render_n}",
    ]
    for line in lines:
        LOGGER.info(line)
        print(line, file=sys.stderr, flush=True)
    if yolo_n != vlm_n:
        msg = f"错误：YOLO输出候选框总数({yolo_n}) != 送入VLM元件总数({vlm_n})"
        LOGGER.error(msg)
        print(msg, file=sys.stderr, flush=True)
    if vlm_n != vlm_ok + vlm_fb:
        msg = f"错误：送入VLM元件总数({vlm_n}) != VLM成功解析({vlm_ok})+VLM兜底未知元件({vlm_fb})"
        LOGGER.error(msg)
        print(msg, file=sys.stderr, flush=True)
    if draw_n != render_n:
        msg = f"错误：送入绘图的元件数量({draw_n}) != 最终渲染标注元件总数({render_n})"
        LOGGER.error(msg)
        print(msg, file=sys.stderr, flush=True)
    if missing_ids:
        msg = f"丢失元件的唯一ID: {', '.join(missing_ids)}"
        LOGGER.error(msg)
        print(msg, file=sys.stderr, flush=True)


def run_pipeline(
    image_path: str,
    output_dir: str = "output",
    weights: str | None = None,
    conf: float = YOLO_CONF_THRESHOLD,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    image_path = str(Path(image_path).resolve())
    original = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if original is None:
        raise RuntimeError(f"无法读取电路板图片: {image_path}")

    LOGGER.info("1/4 YOLO 检测元器件位置")
    boxes, yolo_stats = detect_components(
        image_path,
        weights=weights,
        conf=conf,
        iou=YOLO_IOU,
        imgsz=YOLO_IMGSZ,
        max_det=YOLO_MAX_DET,
    )
    count_log("YOLO检出", len(boxes))
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    debug_bbox = out_dir / "debug_bbox.jpg"
    debug_yolo = out_dir / f"{Path(image_path).stem}_yolo_boxes_{stamp}.jpg"
    try:
        save_yolo_debug_preview(image_path, boxes, str(debug_bbox))
        save_yolo_debug_preview(image_path, boxes, str(debug_yolo))
    except Exception as exc:
        LOGGER.warning("YOLO 调试图保存失败: %s", exc)
        debug_yolo = None
    if not boxes:
        count_log("送入VLM", 0)
        print_summary(0, 0, 0, 0, 0, 0)
        return {
            "ok": False,
            "error": "YOLO 未检出元器件。预训练 COCO 权重对 PCB 效果有限，请用 --weights 换成 PCB 训练权重。",
            "labels": [],
            "skipped": 0,
            "detected": 0,
            "debugYolo": str(debug_bbox),
        }

    LOGGER.info("2/4 按检测框裁剪元件小图")
    crops = crop_detections(original, boxes)

    LOGGER.info("3/4 VLM 识别元件名称（解析失败用「未知元器件」继续绘图，不丢框）")
    named = []
    vlm_ok = 0
    vlm_fb = 0
    key = resolve_api_key(api_key)
    count_log("送入VLM", len(boxes))
    for i, (box, crop) in enumerate(zip(boxes, crops), start=1):
        uid = box.get("id") or f"yolo-{i - 1:04d}"
        result = recognize_crop(crop, api_key=key, model=model, component_id=uid)
        if result.get("vlm_ok"):
            vlm_ok += 1
        else:
            vlm_fb += 1
        label = format_label(result) or FALLBACK_NAME
        named.append({**box, "id": uid, "label": label, **result})
    log_vlm_stats(len(boxes), vlm_ok, vlm_fb)
    if len(named) != len(boxes):
        lost = [b.get("id") for b in boxes if b.get("id") not in {n.get("id") for n in named}]
        LOGGER.error("VLM阶段丢失元件 ID: %s", lost)

    LOGGER.info("4/4 OpenCV 绘制箭头与标签（不得丢弃任何 YOLO 检测框）")
    out_file = out_dir / f"{Path(image_path).stem}_annotated_{stamp}.jpg"
    saved, labels = annotate_image(image_path, named, str(out_file))
    in_ids = [str(n.get("id")) for n in named]
    out_ids = [str(lb.get("id") or "") for lb in labels]
    missing = [uid for uid in in_ids if uid not in out_ids]
    print_summary(
        yolo_n=yolo_stats.get("after_filter", len(boxes)),
        vlm_n=len(boxes),
        vlm_ok=vlm_ok,
        vlm_fb=vlm_fb,
        draw_n=len(named),
        render_n=len(labels),
        missing_ids=missing,
    )
    sidecar = Path(saved).with_suffix(".json")
    payload = {
        "ok": True,
        "source": image_path,
        "output": saved,
        "debugYolo": str(debug_bbox),
        "detected": len(boxes),
        "labeled": len(labels),
        "vlmFailed": vlm_fb,
        "vlmOk": vlm_ok,
        "skipped": 0,
        "width": int(original.shape[1]),
        "height": int(original.shape[0]),
        "labels": labels,
    }
    sidecar.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    LOGGER.info("[debug_bbox] %s", debug_bbox)
    print(f"[debug_bbox] {debug_bbox}", file=sys.stderr, flush=True)
    LOGGER.info("完成：检出 %s，渲染 %s，VLM兜底 %s → %s", len(boxes), len(labels), vlm_fb, saved)
    return payload


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="电路板元器件自动标注（YOLO + Qwen-VL + OpenCV）")
    parser.add_argument("--image", required=True, help="本地电路板照片路径")
    parser.add_argument("--output-dir", default=str(Path(__file__).resolve().parent / "output"), help="标注成品目录")
    parser.add_argument(
        "--weights",
        default=os.environ.get("YOLO_WEIGHTS") or None,
        help="YOLO 权重，默认 yolo11n.pt，可换成 PCB 训练权重",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=YOLO_CONF_THRESHOLD,
        help="YOLO 置信度阈值（默认 0.18，低置信框仍全部送入 VLM）",
    )
    parser.add_argument("--api-key", default=None, help="可选，优先使用环境变量 QWEN_VL_API_KEY")
    parser.add_argument("--model", default=None, help="VLM 模型名，默认 qwen-vl-plus")
    parser.add_argument("--json", action="store_true", help="仅向 stdout 打印 JSON 结果，日志走 stderr")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )
    try:
        result = run_pipeline(
            image_path=args.image,
            output_dir=args.output_dir,
            weights=args.weights,
            conf=args.conf,
            api_key=args.api_key,
            model=args.model,
        )
    except Exception as exc:
        LOGGER.exception("标注流水线中断")
        result = {"ok": False, "error": str(exc), "labels": []}
        if args.json:
            print(json.dumps(result, ensure_ascii=False), flush=True)
        return 1

    if args.json:
        print(json.dumps(result, ensure_ascii=False), flush=True)
    else:
        if result.get("ok"):
            print(f"标注完成: {result['output']}")
            print(f"检出 {result['detected']}，成功渲染 {result['labeled']}，VLM兜底仍绘制 {result.get('vlmFailed', 0)}")
        else:
            print(result.get("error") or "标注失败")
            return 1
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
