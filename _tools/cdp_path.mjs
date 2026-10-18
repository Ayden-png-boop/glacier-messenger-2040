/**
 * 按指定 choice-id 序列实机通关，验证结局。
 * 用法: node cdp_path.mjs c1a,c2a,c3b,c4a,c5b,c6a,c7b,c8a
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const SEQ = (process.argv[2] || '').split(',').filter(Boolean)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9226

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-path',
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
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id
  pending.set(mid, res)
  ws.send(JSON.stringify({ id: mid, method, params }))
})
const evalJs = async (e) =>
  (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('gm_identity', JSON.stringify({ name: 'Tester', email: '', isAnonymous: false })) } catch (e) {}` })
await send('Page.navigate', { url: 'http://localhost:5273/' })
await sleep(7000)
await evalJs(`window.__errs=[];window.addEventListener('error',e=>__errs.push(String(e.message).slice(0,140)));1`)

const state = () => evalJs(`
JSON.stringify({
  h2: document.querySelector('h2')?.textContent?.trim() || null,
  rings: [...document.querySelectorAll('.absolute.inset-0 span')].map(s=>s.textContent),
  choices: [...document.querySelectorAll('button[data-choice-id]')].map(b=>b.dataset.choiceId + (b.disabled?'(lock)':'')),
  restart: [...document.querySelectorAll('button')].some(b=>/重新开始|Restart/.test(b.textContent))
})`)

console.log('序列:', SEQ.join(' → '))
console.log('  起始:', await state())

for (const cid of SEQ) {
  const r = await evalJs(`
(() => {
  const b = document.querySelector('button[data-choice-id="${cid}"]')
  if (!b) return 'MISSING'
  if (b.disabled) return 'LOCKED'
  b.click()
  return 'OK'
})()`)
  if (r !== 'OK') {
    console.log(`  ✗ ${cid}: ${r}`)
    console.log('  state:', await state())
    break
  }
  // 等转场结束（章节变化 / 结局页 / QTE 浮层）
  let done = false
  for (let i = 0; i < 25; i++) {
    await sleep(2000)
    const s = JSON.parse(await state())
    if (s.restart || (s.choices.length && !s.choices.includes(cid))) { done = true; break }
    if (i === 24) done = false
  }
  const s = JSON.parse(await state())
  console.log(`  ${cid} -> ${r} | 后: ${s.h2 || '结局页'} rings=${JSON.stringify(s.rings)} restart=${s.restart}`)
  if (!done) { console.log('  ⚠ 转场超时'); break }
}

console.log('最终:', await state())
console.log('errors:', await evalJs('JSON.stringify(window.__errs)'))

// 结局页视频需要时间加载：等待后检查 DOM（黑块排查）
await sleep(8000)
console.log('结局视频 DOM:', await evalJs(`
(() => {
  const vids = [...document.querySelectorAll('video')]
  const imgs = [...document.querySelectorAll('img')]
  return JSON.stringify({
    videos: vids.map(v => ({ src: (v.currentSrc||v.src||'').split('/').pop(), rs: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2), w: v.clientWidth, h: v.clientHeight, display: getComputedStyle(v).display, opacity: getComputedStyle(v).opacity })),
    imgs: imgs.map(i => ({ src: (i.currentSrc||i.src||'').split('/').pop(), nw: i.naturalWidth, w: i.clientWidth, h: i.clientHeight, opacity: getComputedStyle(i).opacity })),
    shell: (() => { const s = document.querySelector('.video-shell'); return s ? { html: s.outerHTML.slice(0, 420) } : null })(),
  })
})()`))

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync('C:/Users/-/Desktop/冰川信使海外版/_shots/path_end.png', Buffer.from(shot.result.data, 'base64'))
  console.log('screenshot: _shots/path_end.png')
}
ws.close(); chrome.kill(); process.exit(0)
