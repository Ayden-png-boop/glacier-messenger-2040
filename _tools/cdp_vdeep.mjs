/**
 * 黑屏根因取证：把 .video-shell 里 <video> 的几何与内联样式全量打出来，
 * 并用 elementsFromPoint 看「这个位置到底谁在画」。
 * 用法: node cdp_vdeep.mjs [url]
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, mkdirSync } from 'node:fs'

const URL = process.argv[2] || 'https://redspiderbc.cn/Ayden-BHG/national/'
const OUT = 'C:/Users/-/Desktop/冰川信使海外版/_shots/vdeep'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9367
mkdirSync(OUT, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1080,760',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-vdeep-${Date.now()}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {}
})

async function target() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const p = list.find((x) => x.type === 'page')
      if (p) return p
    } catch {}
    await sleep(500)
  }
  throw new Error('no target')
}
const tg = await target()
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let id = 0
const pend = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const mid = ++id
    pend.set(mid, r)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 760, deviceScaleFactor: 1, mobile: false })
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'Deep',email:'',isAnonymous:false}))}catch(e){}`,
})

const DUMP = `(() => {
  const shell = document.querySelector('.video-shell')
  if (!shell) return 'NO_SHELL'
  const v = shell.querySelector('video')
  const img = shell.querySelector('img')
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] }
  const c = (el) => { if (!el) return null; const s = getComputedStyle(el); return { d: s.display, op: s.opacity, vis: s.visibility, pos: s.position, w: s.width, h: s.height, tf: s.transform } }
  const sr = shell.getBoundingClientRect()
  const cx = sr.left + sr.width / 2
  const cy = sr.top + sr.height / 2
  const top = document.elementsFromPoint(cx, cy).slice(0, 5).map((e) => e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''))
  return JSON.stringify({
    ch: (document.querySelector('h2')?.textContent || '').trim().slice(0, 24),
    shellBox: [Math.round(sr.width), Math.round(sr.height)],
    hasV: !!v,
    vBox: r(v),
    vStyle: v ? v.getAttribute('style') : null,
    vComputed: c(v),
    vRS: v ? v.readyState : null,
    vTime: v ? +v.currentTime.toFixed(2) : null,
    vFrames: v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames : null,
    vSrc: v ? (v.currentSrc || '').split('/').pop() : null,
    imgBox: r(img),
    imgComputed: c(img),
    stack: top,
    vInDoc: document.querySelectorAll('video').length,
  })
})()`

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(9000)

const dump = async (tag) => {
  const raw = await evalJs(DUMP)
  if (raw === 'NO_SHELL') {
    console.log(`\n== ${tag} ==  NO_SHELL；body=`, await evalJs('document.body.innerText.slice(0,200)'))
    await evalJs('0')
    const p0 = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${tag}_noshell.png`, Buffer.from(p0.result.data, 'base64'))
    return
  }
  const s = JSON.parse(raw)
  console.log(`\n== ${tag} ==`)
  console.log(JSON.stringify(s, null, 1))
  const p = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${tag}.png`, Buffer.from(p.result.data, 'base64'))
}

await dump('ch1_3s')
await sleep(3000)
await dump('ch1_6s')

for (let step = 1; step <= 3; step += 1) {
  const clicked = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled)
    if (!btns.length) return 'NONE'
    const b = btns[0]; const t = b.textContent.trim().slice(0, 10); b.click(); return t
  })()`)
  console.log(`\n[step${step}] 点击 ${clicked}`)
  const before = await evalJs(`(document.querySelector('h2')?.textContent||'').trim()`)
  for (let i = 0; i < 40; i += 1) {
    await sleep(600)
    const cur = await evalJs(`(document.querySelector('h2')?.textContent||'').trim()`)
    if (cur && cur !== before) break
  }
  await sleep(2500)
  await dump(`step${step}_ch`)
  await sleep(3000)
  await dump(`step${step}_ch_6s`)
}

ws.close()
chrome.kill()
process.exit(0)
