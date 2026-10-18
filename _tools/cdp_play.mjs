/** 播放流畅度测量：起播时间 + 卡顿(waiting)次数 + 首屏视频字节 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://localhost:4173/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9230

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-play-${Date.now()}`,
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
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// 在文档创建前注入探针，记录每个 video 元素的事件时间线
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__vlog = { events: [], t0: performance.now() }
    const origPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      const el = this
      const tag = (el.src || '').split('/').pop() || 'unknown'
      if (!el.__tagged) {
        el.__tagged = true
        const log = (n) => window.__vlog.events.push({ tag, ev: n, t: Math.round(performance.now() - window.__vlog.t0) })
        ;['loadstart','loadedmetadata','loadeddata','canplay','playing','waiting','stalled','suspend','progress','canplaythrough','ended','error']
          .forEach(n => el.addEventListener(n, () => log(n), { once: n === 'playing' || n === 'ended' || n === 'error' }))
      }
      return origPlay.apply(this, arguments)
    }
  `,
})
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 60,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1 * 1024 * 1024) / 8,
})

await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('gm_identity', JSON.stringify({ name: 'Tester', email: '', isAnonymous: false })) } catch (e) {}` })
await send('Page.navigate', { url: URL })
await sleep(20000)

const out = await evalJs(`
(() => {
  const v = window.__vlog || { events: [] }
  const byTag = {}
  for (const e of v.events) { (byTag[e.tag] = byTag[e.tag] || []).push(e) }
  const summary = {}
  for (const [tag, list] of Object.entries(byTag)) {
    const first = (n) => (list.find(x => x.ev === n) || {}).t
    summary[tag] = {
      loadedmetadata: first('loadedmetadata'),
      canplay: first('canplay'),
      playing: first('playing'),
      canplaythrough: first('canplaythrough'),
      waitingN: list.filter(x => x.ev === 'waiting').length,
      waitingAt: list.filter(x => x.ev === 'waiting').map(x => x.t),
      stalled: list.filter(x => x.ev === 'stalled').length,
      suspendAt: list.filter(x => x.ev === 'suspend').map(x => x.t),
      suspend: list.filter(x => x.ev === 'suspend').length,
      progress: list.filter(x => x.ev === 'progress').length,
    }
  }
  const res = performance.getEntriesByType('resource')
  const vid = res.filter(r => /\\/videos\\//.test(r.name))
  const main = document.querySelector('video')
  return JSON.stringify({
    timeline: summary,
    videoBytes: Math.round(vid.reduce((a,b)=>a+b.encodedBodySize,0)/1024) + ' KB',
    videoCount: vid.length,
    mainVideo: main ? { src: (main.currentSrc||'').split('/').pop(), readyState: main.readyState, currentTime: +main.currentTime.toFixed(2), paused: main.paused } : null,
    fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
  }, null, 1)
})()
`)
console.log(out)
ws.close(); chrome.kill(); process.exit(0)
