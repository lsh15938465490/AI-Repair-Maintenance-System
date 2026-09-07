# -*- coding: utf-8 -*-
"""电路板标注绘图。只叠加箭头和文字，不改原图文件，不改 YOLO/VLM。"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

LOGGER = logging.getLogger("pcb_annotate.draw")

RED_BGR = (0, 0, 255)
RED_RGB = (229, 57, 53)
BLACK_RGB = (0, 0, 0)
GREEN_BGR = (0, 220, 0)
MAGENTA_BGR = (255, 0, 255)
STEP = 8
GAP = 14
DEFAULT_LABEL = "未知元器件"


def _log(msg: str) -> None:
    LOGGER.info(msg)
    print(msg, file=sys.stderr, flush=True)


def _chinese_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
    ]
    for path in candidates:
        if Path(path).is_file():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    LOGGER.warning("未找到中文字体，标签可能显示为方框")
    return ImageFont.load_default()


def _text_size(font: ImageFont.ImageFont, text: str) -> tuple[int, int]:
    dummy = Image.new("RGB", (8, 8))
    draw = ImageDraw.Draw(dummy)
    x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font)
    return max(1, x1 - x0), max(1, y1 - y0)


def _norm_bbox(det: dict) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = float(det["x1"]), float(det["y1"]), float(det["x2"]), float(det["y2"])
    if x2 < x1:
        x1, x2 = x2, x1
    if y2 < y1:
        y1, y2 = y2, y1
    return x1, y1, x2, y2


def bbox_center_px(det: dict) -> tuple[int, int]:
    """原图像素坐标下的 bbox 几何中心，不做归一化、不按显示尺寸缩放。"""
    x1, y1, x2, y2 = _norm_bbox(det)
    cx = int(round((x1 + x2) / 2.0))
    cy = int(round((y1 + y2) / 2.0))
    if not (x1 < cx < x2):
        cx = int(np.clip(cx, x1 + 1, max(x1 + 1, x2 - 1)))
    if not (y1 < cy < y2):
        cy = int(np.clip(cy, y1 + 1, max(y1 + 1, y2 - 1)))
    return cx, cy


def _overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int], pad: int = 8) -> bool:
    return not (a[2] + pad < b[0] or a[0] > b[2] + pad or a[3] + pad < b[1] or a[1] > b[3] + pad)


def _hits_any(rect: tuple[int, int, int, int], boxes: list[tuple[int, int, int, int]]) -> bool:
    return any(_overlap(rect, box) for box in boxes)


def _clamp_label(lx: int, ly: int, tw: int, th: int, w: int, h: int) -> tuple[int, int]:
    return (
        int(np.clip(lx, 4, max(4, w - tw - 4))),
        int(np.clip(ly, 4, max(4, h - th - 4))),
    )


def _board_union(dets: list[dict], w: int, h: int) -> tuple[int, int, int, int]:
    if not dets:
        return (int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8))
    xs1, ys1, xs2, ys2 = [], [], [], []
    for det in dets:
        x1, y1, x2, y2 = _norm_bbox(det)
        xs1.append(x1)
        ys1.append(y1)
        xs2.append(x2)
        ys2.append(y2)
    pad = 10
    return (
        max(0, int(min(xs1) - pad)),
        max(0, int(min(ys1) - pad)),
        min(w, int(max(xs2) + pad)),
        min(h, int(max(ys2) + pad)),
    )


def _part_rects(dets: list[dict], pad: int = 8) -> list[tuple[int, int, int, int]]:
    rects = []
    for det in dets:
        x1, y1, x2, y2 = _norm_bbox(det)
        rects.append((int(x1) - pad, int(y1) - pad, int(x2) + pad, int(y2) + pad))
    return rects


def _assign_side(cx: float, cy: float, w: int, h: int, board=None) -> str:
    """按相对电路板的远近放到四边；板内放不下时也走板外。"""
    if board:
        bx1, by1, bx2, by2 = board
        d_left, d_right = cx - bx1, bx2 - cx
        d_top, d_bottom = cy - by1, by2 - cy
    else:
        d_left, d_right, d_top, d_bottom = cx, w - cx, cy, h - cy
    if min(d_left, d_right) + 8 < min(d_top, d_bottom):
        return "left" if d_left <= d_right else "right"
    return "top" if d_top <= d_bottom else "bottom"


def _initial_xy(side: str, cx: float, cy: float, tw: int, th: int, board, w: int, h: int) -> tuple[int, int]:
    bx1, by1, bx2, by2 = board
    if side == "top":
        ly = min(int(by1 - GAP - th), int(cy - GAP - th))
        lx = int(cx - tw / 2)
    elif side == "bottom":
        ly = max(int(by2 + GAP), int(cy + GAP))
        lx = int(cx - tw / 2)
    elif side == "left":
        lx = min(int(bx1 - GAP - tw), int(cx - GAP - tw))
        ly = int(cy - th / 2)
    else:
        lx = max(int(bx2 + GAP), int(cx + GAP))
        ly = int(cy - th / 2)
    return _clamp_label(lx, ly, tw, th, w, h)


def _away_delta(side: str) -> tuple[int, int]:
    return {
        "top": (0, -STEP),
        "bottom": (0, STEP),
        "left": (-STEP, 0),
        "right": (STEP, 0),
    }[side]


def _along_delta(side: str, sign: int) -> tuple[int, int]:
    if side in ("top", "bottom"):
        return (sign * STEP, 0)
    return (0, sign * STEP)


def _in_image(lx: int, ly: int, tw: int, th: int, w: int, h: int) -> bool:
    return lx >= 2 and ly >= 2 and lx + tw <= w - 2 and ly + th <= h - 2


def _fits(
    lx: int,
    ly: int,
    tw: int,
    th: int,
    w: int,
    h: int,
    occupied,
    parts,
    avoid_parts: bool = True,
    keepout=None,
) -> bool:
    if not _in_image(lx, ly, tw, th, w, h):
        return False
    rect = (lx, ly, lx + tw, ly + th)
    if keepout and _overlap(rect, keepout, pad=6):
        return False
    if _hits_any(rect, occupied):
        return False
    if avoid_parts and _hits_any(rect, parts):
        return False
    return True


def _search_side(
    try_side: str,
    cx: float,
    cy: float,
    tw: int,
    th: int,
    board,
    w: int,
    h: int,
    occupied,
    parts,
    avoid_parts: bool,
    keepout=None,
) -> tuple[int, int] | None:
    lx, ly = _initial_xy(try_side, cx, cy, tw, th, board, w, h)
    if _fits(lx, ly, tw, th, w, h, occupied, parts, avoid_parts=avoid_parts, keepout=keepout):
        return lx, ly
    dx, dy = _away_delta(try_side)
    x, y = lx, ly
    for _ in range(max(w, h) // STEP):
        x += dx
        y += dy
        x, y = _clamp_label(x, y, tw, th, w, h)
        if _fits(x, y, tw, th, w, h, occupied, parts, avoid_parts=avoid_parts, keepout=keepout):
            return x, y
        if (x, y) == _clamp_label(x + dx, y + dy, tw, th, w, h):
            break
    for sign in (1, -1):
        ax, ay = _along_delta(try_side, sign)
        x, y = lx, ly
        for _ in range(max(w, h) // STEP):
            x += ax
            y += ay
            x, y = _clamp_label(x, y, tw, th, w, h)
            if _fits(x, y, tw, th, w, h, occupied, parts, avoid_parts=avoid_parts, keepout=keepout):
                return x, y
            if (x, y) == _clamp_label(x + ax, y + ay, tw, th, w, h):
                break
    return None


def _own_part(cx: float, cy: float, parts: list[tuple[int, int, int, int]]):
    for rect in parts:
        if rect[0] <= cx <= rect[2] and rect[1] <= cy <= rect[3]:
            return rect
    return None


def _search_inside(
    cx: float,
    cy: float,
    tw: int,
    th: int,
    board,
    w: int,
    h: int,
    occupied,
    parts,
) -> tuple[int, int] | None:
    """板外放不下时，改到 PCB 内部间隙；仍找不到则允许压板空白。"""
    own = _own_part(cx, cy, parts)
    gap_try = []
    if own:
        x1, y1, x2, y2 = own
        gap_try = [
            (int(cx - tw / 2), int(y1 - GAP - th)),
            (int(cx - tw / 2), int(y2 + GAP)),
            (int(x1 - GAP - tw), int(cy - th / 2)),
            (int(x2 + GAP), int(cy - th / 2)),
        ]
    for lx, ly in gap_try:
        lx, ly = _clamp_label(lx, ly, tw, th, w, h)
        if _fits(lx, ly, tw, th, w, h, occupied, parts, avoid_parts=True):
            return lx, ly
    for avoid in (True, False):
        for lx, ly in gap_try:
            lx, ly = _clamp_label(lx, ly, tw, th, w, h)
            if _fits(lx, ly, tw, th, w, h, occupied, parts, avoid_parts=avoid):
                return lx, ly
        step = max(STEP, th + 4)
        bx1, by1, bx2, by2 = board
        y0, y1 = max(4, by1), min(h - th - 4, by2)
        x0, x1 = max(4, bx1), min(w - tw - 4, bx2)
        y = y0
        while y <= y1:
            x = x0
            while x <= x1:
                if _fits(x, y, tw, th, w, h, occupied, parts, avoid_parts=avoid):
                    return x, y
                x += step
            y += step
    return None


def _force_place(cx: float, cy: float, tw: int, th: int, w: int, h: int, side: str = "top", board=None) -> tuple[int, int]:
    """板内放不下时仍放到板外空白，禁止丢弃该元件。"""
    if board:
        bx1, by1, bx2, by2 = board
        if side == "left":
            return _clamp_label(int(bx1 - GAP - tw), int(cy - th / 2), tw, th, w, h)
        if side == "right":
            return _clamp_label(int(bx2 + GAP), int(cy - th / 2), tw, th, w, h)
        if side == "bottom":
            return _clamp_label(int(cx - tw / 2), int(by2 + GAP), tw, th, w, h)
        return _clamp_label(int(cx - tw / 2), int(by1 - GAP - th), tw, th, w, h)
    return _clamp_label(int(cx - tw / 2), int(cy - th - GAP), tw, th, w, h)


def _resolve_pos(
    side: str,
    cx: float,
    cy: float,
    tw: int,
    th: int,
    board,
    w: int,
    h: int,
    occupied,
    parts,
    keepout=None,
) -> tuple[int, int, str, bool]:
    """①外侧 ②板内空白 ③强制落点。任何情况都必须返回坐标，禁止跳过。"""
    outer = keepout or board
    order = [side] + [s for s in ("top", "bottom", "left", "right") if s != side]
    for try_side in order:
        found = _search_side(
            try_side, cx, cy, tw, th, board, w, h, occupied, parts, True, keepout=outer
        )
        if found:
            return found[0], found[1], try_side, try_side != side
    inside = _search_inside(cx, cy, tw, th, board, w, h, occupied, parts)
    if inside:
        return inside[0], inside[1], "inside", True
    lx, ly = _force_place(cx, cy, tw, th, w, h, side, board)
    _log(f"标签无法完全避让，仍强制渲染于 ({lx},{ly}) id={cx},{cy}")
    return lx, ly, side, True


def _label_edge_toward(rect: tuple[int, int, int, int], tx: int, ty: int) -> tuple[int, int]:
    x1, y1, x2, y2 = rect
    ox = (x1 + x2) / 2.0
    oy = (y1 + y2) / 2.0
    dx, dy = tx - ox, ty - oy
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return int(x2), int(round(oy))
    ts = []
    if dx > 1e-6:
        ts.append((x2 - ox) / dx)
    elif dx < -1e-6:
        ts.append((x1 - ox) / dx)
    if dy > 1e-6:
        ts.append((y2 - oy) / dy)
    elif dy < -1e-6:
        ts.append((y1 - oy) / dy)
    t = min((v for v in ts if v > 0), default=1.0)
    return int(round(ox + dx * t)), int(round(oy + dy * t))


def _polyline(
    side: str,
    start: tuple[int, int],
    cx: int,
    cy: int,
    board: tuple[int, int, int, int],
    w: int,
    h: int,
    own_bbox: tuple[int, int, int, int] | None = None,
) -> list[tuple[int, int]]:
    """拐点尽量放在 PCB 外接矩形之外；板内标签则绕开本体，绕不开则直连中心。"""
    sx, sy = int(start[0]), int(start[1])
    tip = (int(cx), int(cy))
    if side == "inside":
        if own_bbox:
            x1, y1, x2, y2 = own_bbox
            if abs(sx - cx) >= abs(sy - cy):
                elbow = (int(np.clip(sx, 4, w - 4)), int(cy))
            else:
                elbow = (int(cx), int(np.clip(sy, 4, h - 4)))
            if abs(elbow[0] - sx) > 1 or abs(elbow[1] - sy) > 1:
                return [(sx, sy), elbow, tip]
        return [(sx, sy), tip]
    bx1, by1, bx2, by2 = board
    m = GAP
    if side == "top":
        ey = min(sy, by1 - m)
        ey = int(np.clip(ey, 4, h - 4))
        elbow = (int(cx), ey)
    elif side == "bottom":
        ey = max(sy, by2 + m)
        ey = int(np.clip(ey, 4, h - 4))
        elbow = (int(cx), ey)
    elif side == "left":
        ex = min(sx, bx1 - m)
        ex = int(np.clip(ex, 4, w - 4))
        elbow = (ex, int(cy))
    else:
        ex = max(sx, bx2 + m)
        ex = int(np.clip(ex, 4, w - 4))
        elbow = (ex, int(cy))
    if abs(elbow[0] - sx) <= 1 and abs(elbow[1] - sy) <= 1:
        return [(sx, sy), tip]
    if abs(elbow[0] - cx) <= 1 and abs(elbow[1] - cy) <= 1:
        return [(sx, sy), tip]
    return [(sx, sy), elbow, tip]


def _leaders_cross(a: list[tuple[int, int]], b: list[tuple[int, int]]) -> bool:
    def orient(p, q, r):
        return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])

    def cross(p1, p2, p3, p4):
        o1, o2 = orient(p1, p2, p3), orient(p1, p2, p4)
        o3, o4 = orient(p3, p4, p1), orient(p3, p4, p2)
        return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)

    for i in range(len(a) - 1):
        for j in range(len(b) - 1):
            if a[i] == b[j] or a[i + 1] == b[j + 1]:
                continue
            if cross(a[i], a[i + 1], b[j], b[j + 1]):
                return True
    return False


def _refresh_path(item: dict, board, w: int, h: int) -> None:
    cx, cy = item["center_x"], item["center_y"]
    start = _label_edge_toward(item["label_rect"], cx, cy)
    own = (
        int(item["x1"]),
        int(item["y1"]),
        int(item["x2"]),
        int(item["y2"]),
    )
    item["path"] = _polyline(item["side"], start, cx, cy, board, w, h, own_bbox=own)
    item["path"][-1] = (cx, cy)


def _stagger_labels(placed: list[dict], board, w: int, h: int, parts) -> None:
    """拐点冲突或引线交叉时，微调标签水平（或垂直）偏移以错开折线。"""

    def occupied_except(idx):
        boxes = list(parts)
        for j, p in enumerate(placed):
            if j != idx:
                boxes.append(p["label_rect"])
        return boxes

    for _ in range(6):
        moved = False
        for i, a in enumerate(placed):
            for j, b in enumerate(placed):
                if j <= i:
                    continue
                _refresh_path(a, board, w, h)
                _refresh_path(b, board, w, h)
                close_elbow = False
                if len(a["path"]) >= 2 and len(b["path"]) >= 2:
                    ea, eb = a["path"][1], b["path"][1]
                    close_elbow = abs(ea[0] - eb[0]) < 16 and abs(ea[1] - eb[1]) < 16
                if not close_elbow and not _leaders_cross(a["path"], b["path"]):
                    continue
                target = b
                tw, th = target["label_wh"]
                lx, ly = target["label_px"]
                if target["side"] in ("top", "bottom"):
                    shift = tw + 12 if lx >= a["label_px"][0] else -(tw + 12)
                    nx, ny = _clamp_label(lx + shift, ly, tw, th, w, h)
                else:
                    shift = th + 12 if ly >= a["label_px"][1] else -(th + 12)
                    nx, ny = _clamp_label(lx, ly + shift, tw, th, w, h)
                rect = (nx, ny, nx + tw, ny + th)
                if _hits_any(rect, occupied_except(j)):
                    continue
                target["label_px"] = (nx, ny)
                target["label_rect"] = rect
                target["offset"] = True
                _refresh_path(target, board, w, h)
                moved = True
        if not moved:
            break


def _side_capacity(side: str, w: int, h: int, th: int, tw_guess: int) -> int:
    gap = th + 10 if side in ("left", "right") else tw_guess + 16
    span = h - 16 if side in ("left", "right") else w - 16
    return max(4, span // max(12, gap))


def _rebalance_buckets(buckets: dict, w: int, h: int, th: int, tw_guess: int) -> None:
    order = ["left", "right", "top", "bottom"]
    for side in order:
        cap = _side_capacity(side, w, h, th, tw_guess)
        while len(buckets[side]) > cap:
            nxt = order[(order.index(side) + 1) % 4]
            buckets[nxt].append(buckets[side].pop())


def _force_no_overlap(placed: list[dict], w: int, h: int, parts) -> None:
    for _ in range(24):
        moved = False
        for i, a in enumerate(placed):
            for j in range(i + 1, len(placed)):
                b = placed[j]
                if not _overlap(a["label_rect"], b["label_rect"], pad=6):
                    continue
                tw, th = b["label_wh"]
                lx, ly = b["label_px"]
                if b["side"] in ("top", "bottom"):
                    shift = tw + 10 if lx >= a["label_px"][0] else -(tw + 10)
                    nx, ny = _clamp_label(lx + shift, ly, tw, th, w, h)
                else:
                    shift = th + 8 if ly >= a["label_px"][1] else -(th + 8)
                    nx, ny = _clamp_label(lx, ly + shift, tw, th, w, h)
                rect = (nx, ny, nx + tw, ny + th)
                others = [p["label_rect"] for k, p in enumerate(placed) if k != j]
                if _hits_any(rect, parts) or _hits_any(rect, others):
                    if b["side"] in ("top", "bottom"):
                        nx, ny = _clamp_label(lx, ly + (8 if b["side"] == "bottom" else -8), tw, th, w, h)
                    else:
                        nx, ny = _clamp_label(lx + (8 if b["side"] == "right" else -8), ly, tw, th, w, h)
                    rect = (nx, ny, nx + tw, ny + th)
                if _hits_any(rect, others):
                    # 避不开重叠也保留当前位置，禁止删除该元件标注
                    continue
                b["label_px"] = (nx, ny)
                b["label_rect"] = rect
                b["offset"] = True
                moved = True
        if not moved:
            break


def _shrink_text_to_canvas(text: str, font, w: int, h: int):
    tw, th = _text_size(font, text)
    if tw <= w - 8 and th <= h - 8:
        return font, tw, th
    size = getattr(font, "size", 16)
    while size >= 10:
        size -= 1
        try:
            font = font.font_variant(size=size) if hasattr(font, "font_variant") else _chinese_font(size)
        except Exception:
            font = _chinese_font(size)
        tw, th = _text_size(font, text)
        if tw <= w - 8 and th <= h - 8:
            return font, tw, th
    return font, min(tw, max(1, w - 8)), min(th, max(1, h - 8))


def layout_labels(detections: list[dict], image_size: tuple[int, int], font, keepout=None) -> list[dict]:
    w, h = image_size
    board = keepout or _board_union(detections, w, h)
    parts = _part_rects(detections, pad=10)
    occupied: list[tuple[int, int, int, int]] = []
    placed: list[dict] = []

    indexed = []
    for i, det in enumerate(detections):
        cx, cy = bbox_center_px(det)
        indexed.append(
            {
                **det,
                "id": det.get("id") or f"yolo-{i:04d}",
                "_src_index": i,
                "center_x": cx,
                "center_y": cy,
                "cx": float(cx),
                "cy": float(cy),
                "side": _assign_side(cx, cy, w, h, board),
            }
        )

    sample_tw, sample_th = _text_size(font, "电阻R12")
    buckets = {"top": [], "bottom": [], "left": [], "right": []}
    for item in indexed:
        buckets[item["side"]].append(item)
    _rebalance_buckets(buckets, w, h, sample_th, sample_tw)
    buckets["top"].sort(key=lambda d: d["cx"])
    buckets["bottom"].sort(key=lambda d: d["cx"])
    buckets["left"].sort(key=lambda d: d["cy"])
    buckets["right"].sort(key=lambda d: d["cy"])

    seen = set()
    for side in ("top", "left", "right", "bottom"):
        group = buckets[side]
        for item in group:
            seen.add(id(item))
            text = item.get("label") or DEFAULT_LABEL
            item_font, tw, th = _shrink_text_to_canvas(text, font, w, h)
            cx, cy = item["center_x"], item["center_y"]
            lx, ly, used_side, moved = _resolve_pos(side, cx, cy, tw, th, board, w, h, occupied, parts)
            rect = (lx, ly, lx + tw, ly + th)
            occupied.append(rect)
            item.update(
                {
                    "label_px": (lx, ly),
                    "label_wh": (tw, th),
                    "label_rect": rect,
                    "side": used_side,
                    "offset": moved or used_side != side,
                    "font": item_font,
                }
            )
            placed.append(item)

    for item in indexed:
        if id(item) in seen:
            continue
        text = item.get("label") or DEFAULT_LABEL
        item_font, tw, th = _shrink_text_to_canvas(text, font, w, h)
        cx, cy = item["center_x"], item["center_y"]
        lx, ly, used_side, moved = _resolve_pos(item["side"], cx, cy, tw, th, board, w, h, occupied, parts)
        rect = (lx, ly, lx + tw, ly + th)
        occupied.append(rect)
        item.update(
            {
                "label_px": (lx, ly),
                "label_wh": (tw, th),
                "label_rect": rect,
                "side": used_side,
                "offset": True,
                "font": item_font,
            }
        )
        placed.append(item)

    _stagger_labels(placed, board, w, h, parts)
    _force_no_overlap(placed, w, h, parts)
    have = {item.get("_src_index") for item in placed}
    for item in indexed:
        if item.get("_src_index") in have:
            continue
        text = item.get("label") or DEFAULT_LABEL
        item_font, tw, th = _shrink_text_to_canvas(text, font, w, h)
        cx, cy = item["center_x"], item["center_y"]
        lx, ly = _force_place(cx, cy, tw, th, w, h, item.get("side") or "top", board)
        rect = (lx, ly, lx + tw, ly + th)
        occupied.append(rect)
        item.update(
            {
                "label_px": (lx, ly),
                "label_wh": (tw, th),
                "label_rect": rect,
                "side": item.get("side") or "top",
                "offset": True,
                "font": item_font,
            }
        )
        placed.append(item)
        _log(f"漏排补绘元件#{item.get('_src_index')} 中心=({cx},{cy})，禁止丢弃")
    for item in placed:
        _refresh_path(item, board, w, h)
    if len(placed) != len(detections):
        _log(f"警告：排版数量 {len(placed)} 与检测数量 {len(detections)} 不一致，正在强制补全")
    return placed


def _draw_leader_shaft(img: np.ndarray, points: list[tuple[int, int]]) -> None:
    """只画折线杆，终点圆点在 PIL 之后用原图像素坐标钉死。"""
    thickness = max(2, int(min(img.shape[:2]) * 0.0024))
    if len(points) < 2:
        return
    tip = (int(points[-1][0]), int(points[-1][1]))
    for i in range(len(points) - 2):
        cv2.line(img, (int(points[i][0]), int(points[i][1])), (int(points[i + 1][0]), int(points[i + 1][1])), RED_BGR, thickness, cv2.LINE_AA)
    p1 = (int(points[-2][0]), int(points[-2][1]))
    span = float(np.hypot(tip[0] - p1[0], tip[1] - p1[1])) or 1.0
    head = min(14.0, max(8.0, span * 0.18))
    ux, uy = (tip[0] - p1[0]) / span, (tip[1] - p1[1]) / span
    neck = (int(round(tip[0] - ux * head)), int(round(tip[1] - uy * head)))
    cv2.line(img, p1, neck, RED_BGR, thickness, cv2.LINE_AA)
    px, py = -uy, ux
    left = (int(round(neck[0] + px * head * 0.42)), int(round(neck[1] + py * head * 0.42)))
    right = (int(round(neck[0] - px * head * 0.42)), int(round(neck[1] - py * head * 0.42)))
    cv2.fillConvexPoly(img, np.array([tip, left, right], dtype=np.int32), RED_BGR)


def _pin_centers(img: np.ndarray, placed: list[dict]) -> None:
    """在最终图上用与 debug_bbox 相同的像素中心点画圆，避免箭头头部造成视觉偏移。"""
    r = max(3, int(min(img.shape[:2]) * 0.003))
    for item in placed:
        cx, cy = int(item["center_x"]), int(item["center_y"])
        cv2.circle(img, (cx, cy), r + 1, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.circle(img, (cx, cy), r, RED_BGR, -1, cv2.LINE_AA)


def _draw_outlined_text(pil_img: Image.Image, xy: tuple[int, int], text: str, font) -> None:
    draw = ImageDraw.Draw(pil_img)
    x, y = xy
    for dx in (-2, -1, 0, 1, 2):
        for dy in (-2, -1, 0, 1, 2):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=BLACK_RGB)
    draw.text((x, y), text, font=font, fill=RED_RGB)


def save_debug_bbox(original: np.ndarray, detections: list[dict], output_path: str) -> str:
    canvas = original.copy()
    h, w = canvas.shape[:2]
    thickness = max(2, int(min(w, h) * 0.0024))
    r = max(4, thickness + 2)
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = max(0.4, min(w, h) / 900)
    _log("===== debug_bbox：对照 YOLO 漏检 / 绘图丢标 =====")
    _log(f"YOLO送到绘图的检测框总数量: {len(detections)}")
    _log("绿框=检测框。此图没有某元件的框=YOLO漏检；此图有框但 output_annotate 无箭头=绘图逻辑问题。")
    for i, det in enumerate(detections):
        x1, y1, x2, y2 = _norm_bbox(det)
        p1 = (int(round(x1)), int(round(y1)))
        p2 = (int(round(x2)), int(round(y2)))
        cx, cy = bbox_center_px(det)
        cv2.rectangle(canvas, p1, p2, GREEN_BGR, thickness, cv2.LINE_AA)
        cv2.circle(canvas, (cx, cy), r, MAGENTA_BGR, -1, cv2.LINE_AA)
        cv2.circle(canvas, (cx, cy), r + 2, (255, 255, 255), 1, cv2.LINE_AA)
        caption = f"{det.get('id') or i} {float(det.get('conf') or 0):.2f}"
        ty = max(16, p1[1] - 6)
        cv2.putText(canvas, caption, (p1[0], ty), font, scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
        cv2.putText(canvas, caption, (p1[0], ty), font, scale, (0, 255, 255), max(1, thickness), cv2.LINE_AA)
        _log(
            f"元件#{i} bbox=({x1:.1f},{y1:.1f},{x2:.1f},{y2:.1f}) center_x={cx} center_y={cy} "
            f"在框内={p1[0] < cx < p2[0] and p1[1] < cy < p2[1]} conf={float(det.get('conf') or 0):.3f} "
            f"图尺寸={w}x{h}"
        )
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(out), canvas):
        raise RuntimeError(f"无法写入 debug_bbox: {out}")
    _log(f"已保存 debug_bbox: {out} （共 {len(detections)} 框）")
    return str(out)


def annotate_image(
    image_path: str,
    detections: list[dict],
    output_path: str,
) -> tuple[str, list[dict]]:
    src = Path(image_path)
    if not src.is_file():
        raise FileNotFoundError(f"找不到原图: {image_path}")

    original = cv2.imread(str(src), cv2.IMREAD_COLOR)
    if original is None:
        raise RuntimeError(f"无法读取图片: {image_path}")

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    debug_path = out.parent / "debug_bbox.jpg"
    final_path = out.parent / "output_annotate.jpg"
    _log(f"[数量追踪] 绘图输入: {len(detections)}")
    save_debug_bbox(original, detections, str(debug_path))
    _log(f"[debug_bbox] {debug_path}")

    canvas = original.copy()
    h, w = canvas.shape[:2]
    _log(f"原图叠加标注，不改分辨率，图像尺寸={w}x{h}，输入元件={len(detections)}")
    font_size = max(14, int(min(w, h) * 0.016))
    font = _chinese_font(font_size)
    board = _board_union(detections, w, h)
    placed = layout_labels(detections, (w, h), font, keepout=board)
    have_ids = {str(p.get("id")) for p in placed if p.get("id") is not None}
    have_idx = {p.get("_src_index") for p in placed}
    for i, det in enumerate(detections):
        uid = str(det.get("id") or f"yolo-{i:04d}")
        if uid in have_ids or i in have_idx:
            have_ids.add(uid)
            continue
        _log(f"绘图补绘未排版元件 id={uid}，禁止丢弃")
        cx, cy = bbox_center_px(det)
        text = det.get("label") or DEFAULT_LABEL
        item_font, tw, th = _shrink_text_to_canvas(text, font, w, h)
        lx, ly = _force_place(cx, cy, tw, th, w, h, "top", board)
        item = {
            **det,
            "id": uid,
            "center_x": cx,
            "center_y": cy,
            "label_px": (lx, ly),
            "label_wh": (tw, th),
            "label_rect": (lx, ly, lx + tw, ly + th),
            "side": "top",
            "offset": True,
            "font": item_font,
        }
        _refresh_path(item, board, w, h)
        placed.append(item)
        have_ids.add(uid)

    for i, item in enumerate(placed):
        cx, cy = int(item["center_x"]), int(item["center_y"])
        own = (int(item["x1"]), int(item["y1"]), int(item["x2"]), int(item["y2"]))
        path = item.get("path") or _polyline(
            item["side"],
            _label_edge_toward(item["label_rect"], cx, cy),
            cx,
            cy,
            board,
            w,
            h,
            own_bbox=own,
        )
        path[-1] = (cx, cy)
        _draw_leader_shaft(canvas, path)
        lx, ly = item["label_px"]
        _log(
            f"渲染 id={item.get('id')} 标签=({lx},{ly}) 侧={item['side']} "
            f"文本={item.get('label') or DEFAULT_LABEL}"
        )

    pil = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
    for item in placed:
        item_font = item.get("font") or font
        _draw_outlined_text(pil, item["label_px"], item.get("label") or DEFAULT_LABEL, item_font)

    annotated = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    _pin_centers(annotated, placed)
    for target in (out, final_path):
        if not cv2.imwrite(str(target), annotated):
            raise RuntimeError(f"无法写入标注图: {target}")
    _log(f"已保存成品标注图: {final_path}")
    _log(f"最终实际渲染绘制的元器件总数量: {len(placed)}")
    in_ids = [str(d.get("id") or f"yolo-{i:04d}") for i, d in enumerate(detections)]
    out_ids = [str(p.get("id") or "") for p in placed]
    missing = [uid for uid in in_ids if uid not in out_ids]
    if missing:
        _log(f"错误：绘图丢失元件 ID: {missing}")

    labels = []
    for item in placed:
        lx, ly = item["label_px"]
        tw, th = item["label_wh"]
        text = item.get("label") or DEFAULT_LABEL
        name = str(item.get("component_name") or "").strip()
        func = str(item.get("function_desc") or "").strip()
        if not name:
            if "、" in text:
                name, _, func = text.partition("、")
                name, func = name.strip(), func.strip()
            else:
                name = text
        labels.append(
            {
                "id": item.get("id"),
                "text": text,
                "name": name or DEFAULT_LABEL,
                "function": func,
                "component_name": name or DEFAULT_LABEL,
                "function_desc": func,
                "targetX": item["center_x"] / w,
                "targetY": item["center_y"] / h,
                "labelX": (lx + tw / 2) / w,
                "labelY": (ly + th / 2) / h,
                "x1": item["x1"],
                "y1": item["y1"],
                "x2": item["x2"],
                "y2": item["y2"],
                "textColor": "#e53935",
                "lineColor": "#e53935",
            }
        )
    return str(final_path), labels


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)
    print("请通过 main.py 调用 annotate_image()")
    print(json.dumps({"ok": False, "error": "请使用 main.py"}, ensure_ascii=False))
