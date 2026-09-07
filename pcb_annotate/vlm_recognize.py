# -*- coding: utf-8 -*-
"""调用 Qwen-VL，对裁剪后的元件小图做中文命名。失败用「未知元器件」兜底，不丢框。"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import sys

from pathlib import Path

import cv2
import numpy as np
import requests

LOGGER = logging.getLogger("pcb_annotate.vlm")


def _log(msg: str) -> None:
    LOGGER.info(msg)
    print(msg, file=sys.stderr, flush=True)


def log_vlm_stats(sent: int, ok: int, fallback: int) -> None:
    _log(f"送入VLM识别的元件总数: {sent}")
    _log(f"VLM解析成功的元件数量: {ok}")
    _log(f"VLM异常兜底(未知元器件)的元件数量: {fallback}")
    if sent != ok + fallback:
        _log(f"错误：送入VLM({sent}) != 成功({ok})+兜底({fallback})")

DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_MODEL = "qwen-vl-plus"
FALLBACK_NAME = "未知元器件"
FALLBACK_RESULT = {
    "component_name": FALLBACK_NAME,
    "function_desc": "",
    "vlm_ok": False,
    "fallback": True,
}

_DEFAULT_SYSTEM_PROMPT = """你是电路板元器件识别专家，只分析图片里的电子元件。
输出严格JSON格式，只返回{"component_name":"元器件中文名称","function_desc":"简单电路功能描述"}，不要输出任何多余文字，不要markdown。
例如 {"component_name":"共模电感","function_desc":"滤除电源共模干扰"}"""


def load_vlm_system_prompt() -> str:
    skill = Path(__file__).resolve().parents[1] / "src" / "skills" / "pcb-vlm-component.md"
    if skill.is_file():
        text = skill.read_text(encoding="utf-8").strip()
        if text:
            return text
    return _DEFAULT_SYSTEM_PROMPT


def resolve_api_key(explicit: str | None = None) -> str:
    return (
        (explicit or "").strip()
        or os.environ.get("QWEN_VL_API_KEY", "").strip()
        or os.environ.get("DASHSCOPE_API_KEY", "").strip()
        or os.environ.get("QWEN_API_KEY", "").strip()
    )


def _encode_crop(image: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise RuntimeError("元件小图编码失败")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    raw = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fenced:
        raw = fenced.group(1).strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def recognize_crop(
    image: np.ndarray,
    api_key: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    timeout: int = 60,
    component_id: str | None = None,
) -> dict:
    """
    识别单张元件小图。
    成功返回 {component_name, function_desc, vlm_ok=True}；
    接口异常 / JSON 解析失败 / 空内容时返回兜底「未知元器件」，绝不丢弃对象。
    """
    tag = component_id or "?"
    key = resolve_api_key(api_key)
    if not key:
        LOGGER.error("[%s] 未配置 Qwen-VL API Key，使用兜底标签「未知元器件」", tag)
        return dict(FALLBACK_RESULT)
    if image is None or image.size == 0:
        LOGGER.warning("[%s] 空的裁剪图，使用兜底标签「未知元器件」", tag)
        return dict(FALLBACK_RESULT)

    url = (base_url or os.environ.get("QWEN_VL_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    model_name = model or os.environ.get("QWEN_VL_MODEL") or DEFAULT_MODEL
    b64 = _encode_crop(image)
    payload = {
        "model": model_name,
        "temperature": 0.1,
        "max_tokens": 256,
        "messages": [
            {"role": "system", "content": load_vlm_system_prompt()},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    },
                    {"type": "text", "text": "请识别这张图片里的电子元件。"},
                ],
            }
        ],
    }
    try:
        res = requests.post(
            f"{url}/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
        )
        res.raise_for_status()
        body = res.json()
        choices = body.get("choices") or []
        text = ""
        if choices:
            text = (choices[0].get("message") or {}).get("content") or ""
        if not str(text).strip():
            LOGGER.warning("[%s] VLM 返回空内容，兜底「未知元器件」", tag)
            return dict(FALLBACK_RESULT)
        data = _extract_json(text)
        if not data:
            LOGGER.warning("[%s] VLM 返回无法解析为 JSON，兜底「未知元器件」: %s", tag, str(text)[:200])
            return dict(FALLBACK_RESULT)
        name = str(data.get("component_name") or "").strip()
        func = str(data.get("function_desc") or "").strip()
        if not name:
            LOGGER.warning("[%s] VLM 未给出 component_name，兜底「未知元器件」", tag)
            return dict(FALLBACK_RESULT)
        return {"component_name": name, "function_desc": func, "vlm_ok": True, "fallback": False}
    except Exception as exc:
        LOGGER.warning("[%s] VLM 调用失败，兜底「未知元器件」: %s", tag, exc)
        return dict(FALLBACK_RESULT)


def format_label(item: dict) -> str:
    name = (item.get("component_name") or "").strip() or FALLBACK_NAME
    func = (item.get("function_desc") or "").strip()
    if func and func not in name:
        return f"{name}、{func}"
    return name


def recognize_crops(
    crops: list[np.ndarray],
    component_ids: list[str] | None = None,
    **kwargs,
) -> list[dict]:
    results = []
    total = len(crops)
    ok_n = 0
    fb_n = 0
    for i, crop in enumerate(crops, start=1):
        cid = None
        if component_ids and i - 1 < len(component_ids):
            cid = component_ids[i - 1]
        _log(f"VLM 识别元件 {i}/{total} id={cid or '?'}")
        item = recognize_crop(crop, component_id=cid, **kwargs)
        results.append(item)
        if item.get("vlm_ok"):
            ok_n += 1
        else:
            fb_n += 1
    log_vlm_stats(total, ok_n, fb_n)
    return results


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="仅测试单张裁剪图 VLM 识别")
    parser.add_argument("--image", required=True)
    args = parser.parse_args()
    img = cv2.imread(args.image)
    print(json.dumps(recognize_crop(img), ensure_ascii=False, indent=2))
