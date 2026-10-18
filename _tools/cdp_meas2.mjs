import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9344
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-m2-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
let tg
for (let i = 0; i < 40; i += 1) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) { tg = p; break } } catch {} await sleep(500) }
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'M',email:'',isAnonymous:false}))}catch(e){}` })
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
await sleep(5000)
console.log(await evalJs(`(()=>{const p=document.querySelector('[aria-label="雁群状态"]');const s=p.querySelector('span');const cs=getComputedStyle(s);const r=s.getBoundingClientRect();const pr=p.getBoundingClientRect();
return JSON.stringify({label:{w:+r.width.toFixed(1),h:+r.height.toFixed(1),scroll:s.scrollWidth,fs:cs.fontSize,ls:cs.letterSpacing,ff:cs.fontFamily.slice(0,40)},pill:{w:Math.round(pr.width),h:Math.round(pr.height)},ring:document.querySelector('[aria-label="雁群状态"] svg').getBoundingClientRect().width})})()`))
ws.close(); chrome.kill(); process.exit(0)
