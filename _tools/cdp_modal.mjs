/** 验证开局「参与方式」弹窗：截图 → 校验必填 → 填写 → 开始游戏 → 确认进入剧情 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://localhost:4173/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9241

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-modal-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* noop */ } })

async function target() {
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
const t0 = await target()
const ws = new WebSocket(t0.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pending = new Map()
const errors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.text || 'exception')
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: URL })
await sleep(6000)

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`C:/Users/-/Desktop/冰川信使海外版/_shots/${name}.png`, Buffer.from(r.result.data, 'base64'))
}

const snap = () => evalJs(`(() => {
  const box = document.querySelector('.max-w-md.bg-white')
  const btn = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
  return JSON.stringify({
    modal: !!box,
    welcome: document.querySelector('.max-w-md h2')?.textContent || null,
    sub: document.querySelector('.max-w-md h2 + p')?.textContent || null,
    checkbox: !!document.getElementById('isAnonymous'),
    nameInput: !!document.getElementById('name'),
    emailInput: !!document.getElementById('email'),
    privacy: (document.querySelector('.max-w-md .bg-gray-50 p')||{}).textContent?.slice(0,20) || null,
    buttons: btn,
    chapter: document.querySelector('h2')?.textContent || null,
    videos: document.querySelectorAll('video').length,
  })
})()`)

console.log('--- 1. 初次加载（未登记） ---')
console.log(await snap())
await shot('m1_modal')

console.log('\n--- 2. 空姓名提交，应报必填 ---')
await evalJs(`(() => { const f=document.querySelector('.max-w-md form'); f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})); return 1 })()`)
await sleep(600)
console.log(await evalJs(`JSON.stringify({err: (document.querySelector('.text-red-600')||{}).textContent||null, modal: !!document.querySelector('.max-w-md.bg-white')})`))
await shot('m2_required')

console.log('\n--- 3. 勾选匿名 → 按钮应变为「匿名开始游戏」，姓名栏隐藏 ---')
await evalJs(`(() => { const c=document.getElementById('isAnonymous'); c.click(); return 1 })()`)
await sleep(500)
console.log(await evalJs(`JSON.stringify({nameInput: !!document.getElementById('name'), buttons: [...document.querySelectorAll('.max-w-md button')].map(b=>b.textContent.trim())})`))

console.log('\n--- 4. 取消匿名 → 填姓名 → 开始游戏 ---')
await evalJs(`(() => { document.getElementById('isAnonymous').click(); return 1 })()`)
await sleep(400)
await evalJs(`(() => {
  const i = document.getElementById('name')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  setter.call(i, '林鸦')
  i.dispatchEvent(new Event('input',{bubbles:true}))
  return 1
})()`)
await sleep(400)
await shot('m3_filled')
await evalJs(`(() => { document.querySelector('.max-w-md form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})); return 1 })()`)
await sleep(3000)
console.log(await snap())
await shot('m4_started')

console.log('\n--- 5. 刷新后应不再弹窗（身份已持久化） ---')
await send('Page.navigate', { url: URL })
await sleep(5000)
console.log(await evalJs(`JSON.stringify({modal: !!document.querySelector('.max-w-md.bg-white'), identity: localStorage.getItem('gm_identity'), chapter: document.querySelector('h2')?.textContent})`))

console.log('\n--- 6. 清空身份后重载，弹窗内切换语言应联动全站 ---')
await evalJs(`(() => { localStorage.removeItem('gm_identity'); return 1 })()`)
await send('Page.navigate', { url: URL })
await sleep(5000)
await evalJs(`(() => {
  const s = document.querySelector('.max-w-md select')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set
  setter.call(s, 'en')
  s.dispatchEvent(new Event('change', { bubbles: true }))
  return 1
})()`)
await sleep(800)
console.log(await evalJs(`JSON.stringify({welcome: document.querySelector('.max-w-md h2')?.textContent, sub: document.querySelector('.max-w-md h2 + p')?.textContent, btn: [...document.querySelectorAll('.max-w-md button')].map(b=>b.textContent.trim()), htmlLang: document.documentElement.lang})`))
await shot('m5_en')

console.log('\nerrors:', JSON.stringify(errors))
ws.close(); chrome.kill(); process.exit(0)
