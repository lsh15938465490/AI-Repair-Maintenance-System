# 电路板元器件自动标注

方案：YOLOv11 只做定位 → Qwen-VL 识别元件名称与功能 → OpenCV 在原图副本上画红色箭头和文字。

原图文件不会被改写，也不会用文生图重绘电路板。成品只保存到 `output/`。

## 安装依赖

需要 Python 3.10+（首次运行 YOLO 会下载 `yolo11n.pt`，并安装 PyTorch）。

```bash
cd pcb_annotate
python -m pip install -r requirements.txt
```

配置 Qwen-VL 密钥（不要写进代码）：

```bash
# Windows PowerShell
$env:QWEN_VL_API_KEY="你的DashScope密钥"

# Linux / macOS
export QWEN_VL_API_KEY="你的DashScope密钥"
```

也可用 `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY`。

## 运行

```bash
python main.py --image D:\photos\board.jpg
```

指定 PCB 自训练权重、输出目录：

```bash
python main.py --image board.jpg --weights weights/pcb.pt --output-dir output --conf 0.25
```

机器可读结果（日志在 stderr，JSON 在 stdout）：

```bash
python main.py --image board.jpg --json
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `--image` | 本地电路板照片（必填） |
| `--output-dir` | 标注图输出目录，默认本目录下 `output/` |
| `--weights` | YOLO 权重。默认 `yolo11n.pt`；请替换为 PCB 元器件训练权重 |
| `--conf` | YOLO 置信度，默认 `0.25` |
| `--api-key` | 可选；优先读环境变量 |
| `--model` | VLM 模型，默认 `qwen-vl-plus` |
| `--json` | stdout 只打 JSON |

环境变量 `YOLO_WEIGHTS`、`QWEN_VL_MODEL`、`QWEN_VL_BASE_URL` 可覆盖默认权重、模型和接口地址。

## 模块

- `yolo_detect.py`：检测包围框 `x1,y1,x2,y2`，不做命名。每次运行会在 `output/` 保存 `*_yolo_boxes_*.jpg` 预览图（绿框 + 品红中心点），用来核对检测框是否框准。
- `vlm_recognize.py`：裁剪小图 → JSON `{component_name, function_desc}`，失败则跳过该元件
- `draw_annotate.py`：红箭头指向框中心，黑描边红字，标签放到板外并防重叠
- `main.py`：串联流程

把 PCB 权重放到 `weights/` 后用 `--weights` 指向即可。COCO 预训练权重对电路板特写检出率通常很低。
