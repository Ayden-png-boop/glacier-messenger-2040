/** 首屏性能测量：统计首屏阶段（首个章节视频可播前）实际下载的资源与体积 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://localhost:4173/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9228

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-perf',
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
const events = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method) events.push(m)
}
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

await send('Network.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
// 模拟 4G 下行
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8,
})

await send('Page.navigate', { url: URL })
await sleep(12000)

// 汇总请求
const reqs = new Map()
for (const e of events) {
  if (e.method === 'Network.requestWillBeSent') reqs.set(e.params.requestId, { url: e.params.request.url, type: e.params.type })
  if (e.method === 'Network.responseReceived') {
    const r = reqs.get(e.params.requestId)
    if (r) r.mime = e.params.response.mimeType
  }
  if (e.method === 'Network.loadingFinished') {
    const r = reqs.get(e.params.requestId)
    if (r) r.bytes = e.params.encodedDataLength
  }
}
const list = [...reqs.values()].filter((r) => r.bytes > 0)
const group = (pred) => list.filter(pred).reduce((a, b) => a + b.bytes, 0)
const fmt = (n) => (n / 1024).toFixed(1) + ' KB'

console.log('=== 首屏 12s 内实际下载（模拟 4G）===')
console.log('JS      :', fmt(group((r) => /\.js(\?|$)/.test(r.url))))
console.log('CSS     :', fmt(group((r) => /\.css(\?|$)/.test(r.url))))
console.log('HTML    :', fmt(group((r) => r.type === 'Document')))
console.log('封面webp:', fmt(group((r) => /\/posters\//.test(r.url))))
console.log('视频mp4 :', fmt(group((r) => /\/videos\//.test(r.url))))
console.log('合计    :', fmt(list.reduce((a, b) => a + b.bytes, 0)))
console.log()
console.log('视频请求明细（按体积降序，前10）:')
list.filter((r) => /\/videos\//.test(r.url)).sort((a, b) => b.bytes - a.bytes).slice(0, 10)
  .forEach((r) => console.log('  ', fmt(r.bytes).padStart(10), r.url.split('/').pop()))

// 首屏可交互时间
const perf = await evalJs(`JSON.stringify({
  fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
  domReady: performance.timing?.domContentLoadedEventEnd - performance.timing?.navigationStart,
  videos: [...document.querySelectorAll('video')].length,
  readyState: document.querySelector('video')?.readyState,
  h1: document.querySelector('h1')?.textContent
})`)
console.log()
console.log('性能指标:', perf)

// 页面是否请求了 Range（渐进式播放）
const rangeReqs = events.filter((e) => e.method === 'Network.requestWillBeSent' &&
  /\/videos\//.test(e.params.request.url) && e.params.request.headers?.Range).length
console.log('带 Range 头的视频请求数:', rangeReqs)

ws.close(); chrome.kill(); process.exit(0)
