import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const ADMIN = process.argv[2] || 'http://127.0.0.1:8787/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9324

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'}`,
  '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-dbg-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

async function target() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const p = list.find((x) => x.type === 'page')
      if (p) return p
    } catch {}
    await sleep(500)
  }
  throw new Error('no target')
}
const tg = await target()
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pend = new Map()
const errs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown') errs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || '').split('\n')[0])
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('CONSOLE: ' + JSON.stringify(m.params.args?.map((a) => a.value || a.description)))
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
}
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value
}
await send('Runtime.enable'); await send('Page.enable')

await send('Page.navigate', { url: ADMIN })
await sleep(3000)
console.log('inputs:', await evalJs(`[...document.querySelectorAll('input')].map(i=>({type:i.type, ph:i.placeholder}))`))
console.log('buttons:', await evalJs(`[...document.querySelectorAll('button')].map(b=>({txt:b.textContent.trim().slice(0,10), disabled:b.disabled, type:b.type}))`))

console.log('fill ->', await evalJs(`(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))}; const i=[...document.querySelectorAll('input')]; set(i[0],'${process.env.GM_ADMIN_USER || "管理员"}'); set(i[1],'${process.env.GM_ADMIN_PASS || ""}'); return 'ok'})()`))
await sleep(500)
console.log('after fill values:', await evalJs(`[...document.querySelectorAll('input')].map(i=>i.value)`))
console.log('button disabled now:', await evalJs(`[...document.querySelectorAll('button')].map(b=>b.disabled)`))
console.log('click ->', await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/登/.test(x.textContent)); if(!b) return 'NO_BTN'; b.click(); return 'clicked: '+b.textContent.trim()})()`))
await sleep(3500)
console.log('body:', await evalJs(`document.body.innerText.slice(0,300)`))
console.log('errs:', errs.slice(0,5))
process.exit(0)
