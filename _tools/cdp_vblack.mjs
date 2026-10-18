/**
 * 黑屏取证：逐章自动通关，同时高频采样 .video-shell 里的 <video> 状态。
 *
 * 判定「黑屏」的信号（任意一条命中即截图留证）：
 *   A. 壳子里根本没有 <video>           → 池把正在播的元素摘走了
 *   B. video 的 opacity=1 但 readyState<2 → 元素被 load() 清空了，画面全黑
 *   C. 未暂停、currentTime 在走，但 totalVideoFrames 不涨 → 解码器吐不出帧
 *   D. video 与 poster 的 opacity 都是 0 → 壳子只剩背景色（纯黑）
 *
 * 用法: node cdp_vblack.mjs [url] [outDir]
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, mkdirSync } from 'node:fs'

const URL = process.argv[2] || 'https://redspiderbc.cn/Ayden-BHG/national/'
const OUT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/vblack'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9366
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
    `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-vblack-${Date.now()}`,
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
const errs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown')
    errs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || '').split('\n')[0])
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errs.push('CONSOLE: ' + JSON.stringify(m.params.args?.map((a) => a.value || a.description)))
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
  if (r.result?.exceptionDetails) return 'EVAL_ERR: ' + (r.result.exceptionDetails.exception?.description || '')
  return r.result?.result?.value
}

const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  const p = `${OUT}/${name}.png`
  writeFileSync(p, Buffer.from(s.result.data, 'base64'))
  return p
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 760, deviceScaleFactor: 1, mobile: false })
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'BlackTest',email:'',isAnonymous:false}))}catch(e){}`,
})

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(9000)

/* ── 采样器 ── */
const SNAP = `(() => {
  const shell = document.querySelector('.video-shell')
  if (!shell) return JSON.stringify({ noShell: true })
  const v = shell.querySelector('video')
  const img = shell.querySelector('img')
  const cs = (el) => el ? getComputedStyle(el) : null
  const q = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null
  const r = shell.getBoundingClientRect()
  const h = document.querySelector('h2')?.textContent?.trim() || ''
  return JSON.stringify({
    ch: h.slice(0, 26),
    hasV: !!v,
    conn: v ? v.isConnected : null,
    op: v ? cs(v).opacity : null,
    rs: v ? v.readyState : null,
    ns: v ? v.networkState : null,
    paused: v ? v.paused : null,
    ct: v ? Math.round(v.currentTime * 100) / 100 : null,
    dur: v ? Math.round((v.duration || 0) * 100) / 100 : null,
    vw: v ? v.videoWidth : null,
    vh: v ? v.videoHeight : null,
    err: v && v.error ? v.error.code : null,
    frames: q ? q.totalVideoFrames : null,
    drop: q ? q.droppedVideoFrames : null,
    imgOp: img ? cs(img).opacity : null,
    src: v ? (v.currentSrc || '').split('/').pop() : null,
    box: [Math.round(r.width), Math.round(r.height)],
    muted: v ? v.muted : null,
    vol: v ? Math.round(v.volume * 100) / 100 : null,
    loop: v ? v.loop : null,
  })
})()`

const snap = async () => JSON.parse(await evalJs(SNAP))

let last = null
let flags = []
const anomalies = []
let shotN = 0

const check = async (s, tag) => {
  const bad = []
  if (s.noShell) return bad
  if (!s.hasV) bad.push('NO_VIDEO')
  if (s.hasV && !s.conn) bad.push('DETACHED')
  if (s.op === '1' && s.rs < 2) bad.push('EMPTY_SRC')
  if (s.op === '0' && s.imgOp === '0') bad.push('NOTHING_VISIBLE')
  if (s.err) bad.push('ERR' + s.err)
  if (last && s.frames != null && last.frames != null && !s.paused && s.ct > last.ct) {
    if (s.frames === last.frames && s.ct - last.ct > 0.4) bad.push('NO_FRAMES')
  }
  if (bad.length) {
    const key = bad.join(',')
    if (!flags.includes(key)) flags.push(key)
    const rec = { at: tag, bad, ...s }
    const prevKey = anomalies.length ? anomalies[anomalies.length - 1].bad.join(',') : ''
    if (prevKey !== key) {
      anomalies.push(rec)
      shotN += 1
      const p = await shot(`bad${shotN}_${key.replace(/[^A-Z0-9_]/g, '')}`)
      console.log(`  ⚠ ${tag} ${key}  ${p}`)
    }
  }
  last = s
}

console.log('\n--- 第 1 章采样 ---')
for (let i = 0; i < 14; i += 1) {
  const s = await snap()
  await check(s, 'ch1+' + i * 0.7)
  await sleep(700)
}
await shot('ch1_after')

/* ── 逐章推进 ── */
for (let step = 1; step <= 10; step += 1) {
  const st = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled)
    if (!btns.length) return JSON.stringify({ none: true })
    const h2 = document.querySelector('h2')?.textContent?.trim() || ''
    return JSON.stringify({ h2, n: btns.length, labels: btns.map(b => b.textContent.trim().slice(0, 10)) })
  })()`)
  const info = JSON.parse(st)
  if (info.none) {
    console.log(`\n[step${step}] 无选项，当前：${info.h2 || '(未知)'}，可能已到结局`)
    await shot(`step${step}_nochoice`)
    break
  }
  // 第 3 章避开 QTE（选第 2 个）
  const pickIdx = /第\s*3\s*章/.test(info.h2) ? Math.min(1, info.n - 1) : 0
  const clicked = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled)
    const b = btns[${pickIdx}]
    if (!b) return 'NONE'
    const t = b.textContent.trim().slice(0, 12)
    b.click()
    return t
  })()`)
  console.log(`\n[step${step}] ${info.h2} → 选「${clicked}」`)

  const before = info.h2
  let moved = false
  for (let i = 0; i < 40; i += 1) {
    await sleep(600)
    const s = await snap()
    await check(s, `step${step}-${i}`)
    const cur = s.ch || ''
    if (cur && cur !== before) {
      moved = true
      break
    }
  }
  if (!moved) console.log('  ⚠ 未检测到换章（可能进了结局）')
  // 新章开头密集采样（黑屏最容易发生在起播阶段）
  for (let i = 0; i < 18; i += 1) {
    const s = await snap()
    await check(s, `step${step}+${i * 0.5}`)
    await sleep(500)
  }
  await shot(`step${step}_after`)
}

console.log('\n--- 控制台错误 ---')
console.log(errs.length, JSON.stringify(errs.slice(0, 8)))
console.log('\n--- 异常汇总 ---')
if (!anomalies.length) console.log('  未发现异常')
for (const a of anomalies)
  console.log(
    `  ${a.at}  [${a.bad.join(',')}]  src=${a.src} op=${a.op} imgOp=${a.imgOp} rs=${a.rs} paused=${a.paused} ct=${a.ct}/${a.dur} frames=${a.frames} err=${a.err} ch=${a.ch}`,
  )

console.log('\n截图目录:', OUT)
ws.close()
chrome.kill()
process.exit(0)
