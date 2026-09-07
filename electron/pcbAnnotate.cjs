const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { decodeImage } = require('./materialFolder.cjs')

const ROOT = path.join(__dirname, '..', 'pcb_annotate')
const MAIN = path.join(ROOT, 'main.py')
const OUTPUT = path.join(ROOT, 'output')

function pythonParts() {
  if (process.env.PYTHON) return [process.env.PYTHON]
  if (process.platform === 'win32') return ['py', '-3']
  return ['python3']
}

function writeTempImage(payload) {
  if (payload?.imagePath && fs.existsSync(payload.imagePath)) return payload.imagePath
  const decoded = decodeImage(payload?.image || payload?.front)
  if (!decoded) throw new Error('缺少电路板图片')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcb-annotate-'))
  const file = path.join(dir, `board${decoded.ext || '.jpg'}`)
  fs.writeFileSync(file, decoded.buffer)
  return file
}

function runPython(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const [cmd, ...prefix] = pythonParts()
    const child = spawn(cmd, [...prefix, MAIN, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      windowsHide: true
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('标注超时（超过 15 分钟）'))
    }, 15 * 60 * 1000)
    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      err += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(error.message || '无法启动 Python'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const line = out
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .pop()
      try {
        const data = line ? JSON.parse(line) : null
        if (data) {
          resolve(data)
          return
        }
      } catch {
        // fall through
      }
      reject(new Error(err.trim().split(/\r?\n/).pop() || `Python 退出码 ${code}`))
    })
  })
}

async function runAnnotate(payload = {}) {
  if (!fs.existsSync(MAIN)) {
    return { ok: false, error: '未找到 pcb_annotate/main.py' }
  }
  fs.mkdirSync(OUTPUT, { recursive: true })
  let imagePath = ''
  try {
    imagePath = writeTempImage(payload)
    const args = ['--image', imagePath, '--output-dir', OUTPUT, '--json']
    if (payload.weights) args.push('--weights', String(payload.weights))
    if (payload.conf != null) args.push('--conf', String(payload.conf))
    if (payload.model) args.push('--model', String(payload.model))
    const env = {}
    if (payload.apiKey) env.QWEN_VL_API_KEY = String(payload.apiKey)
    const result = await runPython(args, env)
    return result
  } catch (error) {
    return { ok: false, error: error.message || '标注流水线失败' }
  } finally {
    if (imagePath && imagePath.includes('pcb-annotate-')) {
      try {
        fs.rmSync(path.dirname(imagePath), { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  }
}

module.exports = { runAnnotate, OUTPUT, ROOT }
