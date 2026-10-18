/** 抓取未处理 Promise 拒绝与运行时错误的真实原因 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://localhost:4173/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9251

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-rej-${Date.now()}`,
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
const consoleErrors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args?.map((a) => a.value || a.description || a.type).join(' '))
  }
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
}
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__rej = [];
    window.addEventListener('unhandledrejection', (e) => {
      let d;
      try {
        const r = e.reason;
        d = (r && r.stack) ? (r.name + ': ' + r.message + ' || ' + String(r.stack).split('\\n').slice(0, 3).join(' | '))
                           : ('raw: ' + String(r));
      } catch (_) { d = 'unknown' }
      window.__rej.push(d);
    });
    window.addEventListener('error', (e) => { window.__rej.push('ERR: ' + e.message) });
  `,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: URL })
await sleep(12000)

const out = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__rej || [])', returnByValue: true })
console.log('rejections:', out.result.result.value)
console.log('console errors:', JSON.stringify(consoleErrors.slice(0, 10), null, 1))
ws.close(); chrome.kill(); process.exit(0)
