/** 通用：打开 URL 并对页面求值（用于快速测量） 用法：node cdp_eval.mjs <url> "<js>" [waitMs] [width] */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://localhost:4173/'
const EXPR = process.argv[3] || 'document.title'
const WAIT = Number(process.argv[4] || 6000)
const WIDTH = Number(process.argv[5] || 390)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9261

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-eval-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* noop */ } })

async function target() {
  for (let i = 0; i < 30; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const p = l.find((x) => x.type === 'page')
      if (p) return p
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('no target')
}
const tg = await target()
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true })
// PRESEED：在页面脚本运行前写入 localStorage（用于指定语言 / 身份）
if (process.env.PRESEED) {
  const seed = process.env.PRESEED.split('|').map((kv) => kv.split('='))
  const lines = seed.map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('; ')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { ${lines} } catch (e) {}` })
  await send('Page.navigate', { url: URL })
  await sleep(2000)
}
await send('Page.navigate', { url: URL })
await sleep(WAIT)
if (process.env.SHOT) {
  const { writeFileSync } = await import('node:fs')
  if (process.env.SCROLL) {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${Number(process.env.SCROLL)})` })
    await sleep(900)
  }
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(process.env.SHOT, Buffer.from(s.result.data, 'base64'))
  console.log('shot ->', process.env.SHOT)
}
const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true })
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.result ?? r.result, null, 1))
ws.close(); chrome.kill(); process.exit(0)
