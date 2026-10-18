/**
 * 四语切换回归：切到 en/ja/fr 后标题、旁白、选项、布局宽度是否都正常，
 * 且无控制台报错。长语言（en/fr）最容易把顶栏撑爆或让文字溢出。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.GM_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.argv[2] || 'http://127.0.0.1:4173/'
const PORT = 9410 + Math.floor(Math.random() * 50)
const extra = BASE.includes('redspiderbc') ? ['--proxy-server=http://127.0.0.1:55955'] : []

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    ...extra,
    '--proxy-bypass-list=127.0.0.1;localhost',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-lang-${Date.now()}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {}
})

let tg
for (let i = 0; i < 40; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
    const p = l.find((x) => x.type === 'page')
    if (p) {
      tg = p
      break
    }
  } catch {}
  await sleep(500)
}
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let id = 0
const pend = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const send = (m, p = {}) =>
  new Promise((r) => {
    const i = ++id
    pend.set(i, r)
    ws.send(JSON.stringify({ id: i, method: m, params: p }))
  })
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  return r.result?.exceptionDetails
    ? 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '').slice(0, 150)
    : r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'L',email:'',isAnonymous:false}))}catch(e){}`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: BASE })
await sleep(5000)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/留在微信|Stay/i.test(x.innerText)); if(b)b.click(); return 1})()`)
await sleep(800)
await ev(`(()=>{window.__e=[];window.addEventListener('error',e=>window.__e.push(String(e.message)));return 0})()`)

for (const code of ['zh', 'en', 'ja', 'fr']) {
  await ev(
    `(()=>{const s=document.querySelector('header select'); if(!s) return 'NO_SELECT'; s.value='${code}'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`,
  )
  await sleep(2600)
  const r = await ev(`(()=>{
    const h1=document.querySelector('header h1');
    const narr=document.querySelector('p.story-text');
    const btn=[...document.querySelectorAll('.choice-btn')];
    const sel=document.querySelector('header select');
    const hdr=document.querySelector('header');
    return JSON.stringify({
      h1: h1? h1.innerText.slice(0,28) : null,
      h1Lines: h1? Math.round(h1.getBoundingClientRect().height/parseFloat(getComputedStyle(h1).lineHeight||20)) : 0,
      h1Right: h1? Math.round(h1.getBoundingClientRect().right) : 0,
      hdrH: hdr? Math.round(hdr.getBoundingClientRect().height) : 0,
      narrLen: narr? narr.innerText.length : 0,
      btn0: btn[0]? btn[0].innerText.slice(0,22) : null,
      sel: sel? sel.value : null,
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    })
  })()`)
  console.log(code, r)
}
console.log('errors:', await ev(`JSON.stringify(window.__e||[])`))
ws.close()
chrome.kill()
process.exit(0)
