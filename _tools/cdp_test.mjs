/**
 * CDP 交互测试：真实时钟下验证「点击选项 → 转场 → 章节推进」链路。
 * 用法: node cdp_test.mjs [要点的选项序号，默认1]
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9223
const CHOICE_INDEX = Number(process.argv[2] || 1) - 1

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-cdp',
  'about:blank',
], { stdio: 'ignore' })

process.on('exit', () => {
  try { chrome.kill() } catch { /* noop */ }
})

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
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
function send(method, params = {}) {
  return new Promise((res) => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:5273/' })
await sleep(7000)

// 捕获页面错误
await evalJs(`
  window.__errs = []
  window.addEventListener('error', e => __errs.push(String(e.message).slice(0,150)))
  window.addEventListener('unhandledrejection', e => __errs.push('rej:'+String(e.reason).slice(0,120)))
  1
`)

const snap = `
(() => {
  const h2 = document.querySelector('h2')
  const rings = [...document.querySelectorAll('.absolute.inset-0 span')].map(s => s.textContent)
  const btns = [...document.querySelectorAll('button.choice-btn')].map(b => ({ t: b.textContent.trim().slice(0,14), d: b.disabled }))
  const overlay = !!document.querySelector('.fixed.inset-0.z-50')
  return JSON.stringify({ h2: h2?.textContent?.trim(), rings, overlay, btns: btns.length })
})()
`
console.log('initial:', await evalJs(snap))

// 点击第 N 个可用选项
const clicked = await evalJs(`
(() => {
  const btns = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled)
  if (!btns[${CHOICE_INDEX}]) return 'NO_BTN'
  btns[${CHOICE_INDEX}].click()
  return 'CLICKED:' + btns[${CHOICE_INDEX}].textContent.trim().slice(0, 12)
})()
`)
console.log('action:', clicked)

// 轮询等待章节推进（真实时钟，最长 45s）
const before = await evalJs(`document.querySelector('h2')?.textContent`)
let after = null
for (let i = 0; i < 22; i++) {
  await sleep(2000)
  const cur = await evalJs(`document.querySelector('h2')?.textContent`)
  if (cur !== before) { after = cur; break }
  if (i === 21) after = 'TIMEOUT:' + cur
}
console.log('h2 after transition:', after)
console.log('snapshot:', await evalJs(snap))
console.log('errors:', await evalJs('JSON.stringify(window.__errs)'))

// 再点一次确认解锁
const c2 = await evalJs(`
(() => {
  const btns = [...document.querySelectorAll('button.choice-btn')].filter(b => !b.disabled)
  if (!btns.length) return 'NO_BTN'
  btns[0].click()
  return 'CLICKED2'
})()
`)
console.log('second action:', c2)
await sleep(9000)
console.log('final snapshot:', await evalJs(snap))
console.log('errors final:', await evalJs('JSON.stringify(window.__errs)'))

ws.close()
chrome.kill()
process.exit(0)
