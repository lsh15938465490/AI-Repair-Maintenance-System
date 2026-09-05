# AI电路板辅助维修系统

纯前端 Vue 3 应用：网页可直接打开，也可打包成 Windows 桌面程序安装使用。大模型由用户自备 API Key 调用，密钥只保存在本机。

## 运行方式

### 网页使用

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。也可 `npm run build` 后用任意静态服务器打开 `dist`，或 `npm run preview`。

浏览器若提示“安装应用”，可把本工具安装为 PWA 桌面快捷方式。

### 桌面安装使用

开发调试：

```bash
npm run dev:electron
```

生成安装包（`release` 目录，含 NSIS 安装程序和便携版）：

```bash
npm run build:electron
```

## 使用说明

1. 打开「系统设置」，选择 DeepSeek / 通义千问 / Kimi / 文心一言，填写对应 API Key 并保存。
2. 可点「测试连通性」验证密钥。
3. 在「维修识别」上传正反面实拍图（必填），原理图可选，然后点「开始识别」。
4. 大模型费用由用户自行承担，本工具不代收、不赚差价。
