/* 截取真机自检页（diag.html）：点一次按钮跑完实测，再截全页 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const CHROME = process.env.GM_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/$/, '')
const OUT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/diag.png'
const PORT = 9490 + Math.floor(Math.random() * 20)
const extra = BASE.includes('redspiderbc') ? ['--proxy-server=http://127.0.0.1:55955'] : []
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', ...extra,
  '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-sd-' + Date.now(), 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

let tg
for (let i = 0; i < 40; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) { tg = p; break } } catch {}
  await sleep(500)
}
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: BASE + '/diag.html' }); await sleep(2500)

await ev(`document.querySelector('#btn').scrollIntoView({block:'center'})`); await sleep(400)
const box = JSON.parse(await ev(`(()=>{const b=document.querySelector('#btn');const r=b.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()`))
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await sleep(15000)

await ev(`window.scrollTo(0,0)`); await sleep(500)
const h = await ev(`document.documentElement.scrollHeight`)
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h, 2600), deviceScaleFactor: 2, mobile: true })
await sleep(600)
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
console.log('saved', OUT, 'height', h)
ws.close(); chrome.kill(); process.exit(0)
