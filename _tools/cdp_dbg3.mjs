import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9352
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-dbg-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
let tg
for (let i = 0; i < 40; i += 1) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) { tg = p; break } } catch {} await sleep(500) }
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception?.description?.slice(0, 300)) : r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'N',email:'',isAnonymous:false}))}catch(e){}` })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
await sleep(7000)
console.log('body:', await ev(`document.body.innerText.slice(0,300)`))
console.log('root children:', await ev(`document.getElementById('root')?.children.length`))
console.log('p.story-text:', await ev(`document.querySelectorAll('p.story-text').length`))
console.log('h1:', await ev(`document.querySelector('h1')?.innerText`))
console.log('videos:', await ev(`document.querySelectorAll('video').length`))
ws.close(); chrome.kill(); process.exit(0)
