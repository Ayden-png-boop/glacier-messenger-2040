import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9346
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-ovl-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
let tg
for (let i = 0; i < 40; i += 1) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) { tg = p; break } } catch {} await sleep(500) }
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'M',email:'',isAnonymous:false}))}catch(e){}` })
for (const w of [360, 390, 414, 768, 1280]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 820, deviceScaleFactor: 1, mobile: w < 640 })
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' }); await sleep(3500)
  console.log(w, await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>x.style.position==='fixed');
    const p=document.querySelector('[aria-label="雁群状态"]');
    const l=document.querySelector('header select').closest('div.rounded-lg').parentElement;
    const r=e=>{const q=e.getBoundingClientRect();return {l:Math.round(q.left),r:Math.round(q.right),t:Math.round(q.top),b:Math.round(q.bottom)}};
    const B=r(b),P=r(p),L=r(l);
    const ov=(a,c)=>!(a.r<=c.l||c.r<=a.l||a.b<=c.t||c.b<=a.t);
    return JSON.stringify({sound:B,status:P,lang:L,ovSoundStatus:ov(B,P),ovSoundLang:ov(B,L),titleRight:Math.round(document.querySelector('header h1').getBoundingClientRect().right),scrollW:document.documentElement.scrollWidth})})()`))
}
ws.close(); chrome.kill(); process.exit(0)
