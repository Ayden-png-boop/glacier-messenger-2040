/* 真机自检页：模拟「用户点一次按钮」，确认第四块实测能跑完 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const CHROME = process.env.GM_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/$/, '')
const PORT = 9470 + Math.floor(Math.random() * 20)
const extra = BASE.includes('redspiderbc') ? ['--proxy-server=http://127.0.0.1:55955'] : []
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', ...extra,
  '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-dc-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
let tg
for (let i = 0; i < 40; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) { tg = p; break } } catch {} await sleep(500) }
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? 'ERR ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 150) : r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: BASE + '/diag.html' }); await sleep(2000)

/* 真实鼠标点击（CDP 手势，等价于真机手指点）
   坑：按钮在首屏下方时 getBoundingClientRect 的 y 会超出视口，
   直接 dispatch 会点空 —— 必须先 scrollIntoView 再取坐标。 */
await ev(`document.querySelector('#btn').scrollIntoView({block:'center'})`)
await sleep(600)
const box = await ev(`(()=>{const b=document.querySelector('#btn');const r=b.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,winH:window.innerHeight})})()`)
console.log('按钮坐标:', box)
const { x, y } = JSON.parse(box)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
await sleep(16000)
console.log('== 第四块实测结果 ==')
console.log(await ev(`(()=>{const rows=[...document.querySelectorAll('#t-real tr')];return rows.map(r=>r.children[0].innerText+' = '+r.children[1].innerText).join('\\n')})()`))
console.log('log:', await ev(`document.querySelector('#log').innerText`))
ws.close(); chrome.kill(); process.exit(0)
