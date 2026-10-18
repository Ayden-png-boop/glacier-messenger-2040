import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9343
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-shot-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
let tg
for (let i = 0; i < 40; i += 1) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) { tg = p; break } } catch {} await sleep(500) }
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'M',email:'',isAnonymous:false}))}catch(e){}` })

const shots = [
  { w: 390, h: 844, mobile: true, name: 'm390' },
  { w: 360, h: 800, mobile: true, name: 'm360' },
  { w: 1366, h: 860, mobile: false, name: 'desk' },
]
for (const s of shots) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.mobile ? 2 : 1, mobile: s.mobile })
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
  await sleep(6000)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(`C:/Users/-/Desktop/冰川信使海外版/_shots/lay_${s.name}.png`, Buffer.from(shot.result.data, 'base64'))
  console.log('shot', s.name)
}
ws.close(); chrome.kill(); process.exit(0)
