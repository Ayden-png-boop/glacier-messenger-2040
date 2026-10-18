/** QTE 小游戏实机测试：走到第3章 → 选 c3a 夜袭 → 自动点阀门 → 验证结果与流转 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9227

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-qte',
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

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('gm_identity', JSON.stringify({ name: 'Tester', email: '', isAnonymous: false })) } catch (e) {}` })
await send('Page.navigate', { url: 'http://localhost:5273/' })
await sleep(7000)
await evalJs(`window.__errs=[];window.addEventListener('error',e=>__errs.push(String(e.message).slice(0,140)));1`)

const st = () => evalJs(`JSON.stringify({h2:document.querySelector('h2')?.textContent?.trim()||null, rings:[...document.querySelectorAll('.absolute.inset-0 span')].map(s=>s.textContent), qte: !!document.querySelector('[aria-label="valve"]'), qtePanel: [...document.querySelectorAll('h3')].some(h=>/QTE/.test(h.textContent)), btns:[...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,10))})`)

const clickAndWait = async (sel, waitMs = 2000) => {
  await evalJs(`(()=>{const b=document.querySelector('${sel}');if(!b)return 'MISSING';if(b.disabled)return 'LOCKED';b.click();return 'OK'})()`)
  await sleep(waitMs)
}

console.log('start:', await st())
// 第1章 → 第2章
await clickAndWait('button[data-choice-id="c1a"]', 14000)
console.log('after c1a:', await st())
await clickAndWait('button[data-choice-id="c2a"]', 14000)
console.log('after c2a:', await st())

// 第3章选 QTE 选项
const r = await evalJs(`(()=>{const b=document.querySelector('button[data-choice-id="c3a"]');if(!b)return 'MISSING';if(b.disabled)return 'LOCKED';b.click();return 'OK'})()`)
console.log('click c3a:', r)
await sleep(3000)
console.log('QTE 浮层:', await st())

// 点「开始突袭」
const go = await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/开始突袭|Begin the Raid/.test(x.textContent));if(!b)return 'NO_GO';b.click();return 'GO_CLICKED'})()`)
console.log('start raid:', go)

// 自动点阀门（最多 35 秒）
let hits = 0
for (let i = 0; i < 180; i++) {
  const done = await evalJs(`(()=>{const v=document.querySelector('[aria-label="valve"]');if(v){v.click();return 'HIT'} const s=[...document.querySelectorAll('button')].find(x=>/正在模拟后果|Simulating/.test(x.textContent)); return s?'DONE':'WAIT'})()`)
  if (done === 'HIT') { hits++; await sleep(180); continue }
  if (done === 'DONE') break
  await sleep(300)
}
console.log('阀门点击次数:', hits)
console.log('QTE 结果态:', await st())

// 点「正在模拟后果…」推进
const fin = await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/正在模拟后果|Simulating/.test(x.textContent));if(!b)return 'NO_BTN';b.click();return 'FIN_CLICKED'})()`)
console.log('finish:', fin)
await sleep(14000)
console.log('最终:', await st())
console.log('errors:', await evalJs('JSON.stringify(window.__errs)'))
ws.close(); chrome.kill(); process.exit(0)
