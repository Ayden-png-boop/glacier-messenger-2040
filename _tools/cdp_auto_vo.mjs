/**
 * CDP 自动通关测试。
 * 用法: node cdp_auto.mjs <path>   path=0 每章点第一个选项; path=1 每章点第二个选项
 * 自动避开 QTE（第3章点 c3b）。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9224
const PATH_IDX = Number(process.argv[2] || 0)

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-cdp' + PATH_IDX,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* noop */ } })

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('no CDP target')
}

const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id
  pending.set(mid, res)
  ws.send(JSON.stringify({ id: mid, method, params }))
})
const evalJs = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('gm_identity', JSON.stringify({ name: 'Tester', email: '', isAnonymous: false })) } catch (e) {}` })
await send('Page.navigate', { url: process.argv[3] || 'http://127.0.0.1:4174/' })
await sleep(7000)

await evalJs(`
  window.__errs = []
  window.addEventListener('error', e => __errs.push(String(e.message).slice(0,150)))
  window.addEventListener('unhandledrejection', e => __errs.push('rej:'+String(e.reason).slice(0,120)))
  1
`)

const readState = () => evalJs(`
(() => {
  const h2 = document.querySelector('h2')
  const rings = [...document.querySelectorAll('.absolute.inset-0 span')].map(s => s.textContent)
  const choices = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled).length
  const restart = [...document.querySelectorAll('button')].some(b => /重新开始|Restart|もう一度|Recommencer/.test(b.textContent))
  const endingTag = [...document.querySelectorAll('h1,h2,h3,.text-cyan-300')].map(e=>e.textContent.trim()).find(t=>/结局|Ending|結末|Fin/.test(t) && t.length < 30)
  const score = [...document.querySelectorAll('*')].map(e=>e.textContent).find(t=>/综合得分|Total Score|総合スコア|Score total/.test(t||''))
  return JSON.stringify({ h2: h2?.textContent?.trim() || null, rings, choices, restart, endingTag: endingTag||null, score: (score||'').slice(0,40) })
})()
`)

console.log(`== 路径 ${PATH_IDX}（每章点第 ${PATH_IDX + 1} 个选项）==`)
console.log('start:', await readState())

for (let step = 1; step <= 14; step++) {
  const state = JSON.parse(await readState())
  if (state.restart) {
    console.log(`>> 通关！共 ${step - 1} 次抉择`)
    console.log('ending state:', JSON.stringify(state))
    break
  }
  if (!state.choices) {
    console.log('>> 无可用选项，停在:', state.h2, JSON.stringify(state.rings))
    break
  }
  // 第3章用第二个选项避开 QTE
  const isQteChapter = /第3章|Chapter 3|第3章|Chapitre 3/.test(state.h2 || '')
  const idx = isQteChapter ? 1 : PATH_IDX
  const r = await evalJs(`
(() => {
  const btns = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled)
  const i = Math.min(${idx}, btns.length - 1)
  if (i < 0) return 'NONE'
  const label = btns[i].textContent.trim().slice(0, 12)
  btns[i].click()
  return label
})()
`)
  console.log(`step${step} [${state.h2}] rings=${JSON.stringify(state.rings)} -> 选「${r}」`)
  // 等转场：视频 onEnded 或 12s 兜底；真实时钟轮询
  const before = (await evalJs(`document.querySelector('h2')?.textContent`))
  let ok = false
  for (let i = 0; i < 24; i++) {
    await sleep(2000)
    const cur = await evalJs(`document.querySelector('h2')?.textContent`)
    const st = JSON.parse(await readState())
    if (st.restart || cur !== before) { ok = true; break }
  }
  if (!ok) {
    console.log('>> 转场超时！')
    console.log('state:', await readState())
    console.log('errors:', await evalJs('JSON.stringify(window.__errs)'))
    break
  }
}

console.log('final:', await readState())
console.log('errors:', await evalJs('JSON.stringify(window.__errs)'))

/* ── 结局页配音断言 ── */
await sleep(4000)
console.log('--- 结局配音 ---')
console.log(await evalJs(`JSON.stringify({
  voSpans: document.querySelectorAll('span[data-vo-id]').length,
  ids: [...document.querySelectorAll('span[data-vo-id]')].map(s=>s.dataset.voId),
  active: document.querySelector('p.story-text')?.dataset.voActive || null,
  voiceReqs: performance.getEntriesByType('resource').filter(r=>r.name.includes('/voice/')).map(r=>r.name.split('/voice/')[1])
})`))

// 截一张结局图
const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`C:/Users/-/Desktop/冰川信使海外版/_shots/auto_p${PATH_IDX}_end.png`, Buffer.from(shot.result.data, 'base64'))
  console.log('screenshot saved')
}

ws.close()
chrome.kill()
process.exit(0)
