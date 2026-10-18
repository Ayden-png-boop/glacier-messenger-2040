/** 首屏性能测量（基于页面 Performance API） */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://localhost:4173/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9229

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-perf-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* noop */ } })

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const p = list.find((t) => t.type === 'page')
      if (p) return p
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('no target')
}
const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 60,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1 * 1024 * 1024) / 8,
})
await send('Page.navigate', { url: URL })
await sleep(15000)

const report = await evalJs(`
(() => {
  const res = performance.getEntriesByType('resource')
  const pick = (re) => res.filter(r => re.test(r.name))
  const sum = (arr, f) => arr.reduce((a,b) => a + (f(b)||0), 0)
  const fmt = n => (n/1024).toFixed(1)
  const paint = {}
  for (const p of performance.getEntriesByType('paint')) paint[p.name] = Math.round(p.startTime)
  const vids = [...document.querySelectorAll('video')].map(v => ({ src: (v.currentSrc||'').split('/').pop(), rs: v.readyState }))
  return JSON.stringify({
    paint,
    counts: { js: pick(/\\.js$/).length, css: pick(/\\.css$/).length, poster: pick(/\\/posters\\//).length, video: pick(/\\/videos\\//).length },
    kb: {
      js: fmt(sum(pick(/\\.js$/), r => r.encodedBodySize)),
      css: fmt(sum(pick(/\\.css$/), r => r.encodedBodySize)),
      html: fmt(sum(pick(new RegExp(location.origin + '/$')), r => r.encodedBodySize)),
      poster: fmt(sum(pick(/\\/posters\\//), r => r.encodedBodySize)),
      video: fmt(sum(pick(/\\/videos\\//), r => r.encodedBodySize)),
      total: fmt(sum(res, r => r.encodedBodySize)),
    },
    videoList: pick(/\\/videos\\//).map(r => ({ n: r.name.split('/').pop(), kb: (r.encodedBodySize/1024).toFixed(1), ms: Math.round(r.duration) })),
    domVideos: vids,
  }, null, 1)
})()
`)
console.log(report)

const lcp = await evalJs(`new Promise(res => { let v = null; new PerformanceObserver(l => { for (const e of l.getEntries()) v = Math.round(e.startTime) }).observe({type:'largest-contentful-paint', buffered:true}); setTimeout(() => res(v), 500) })`)
console.log('LCP(ms):', lcp)

ws.close(); chrome.kill(); process.exit(0)
