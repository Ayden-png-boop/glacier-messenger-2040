/** 诊断：到底是谁把章节正片 video 的 src 摘掉的（打印调用栈） */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const URL = process.argv[2] || 'http://127.0.0.1:5275/'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9332

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'}`,
  '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-dg2-${Date.now()}`,
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
}
const send = (method, params = {}) => new Promise((r) => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'EVAL_ERR: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '')
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'D',email:'',isAnonymous:false}))}catch(e){}
(function(){
  window.__ev = [];
  var ora = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function(n){
    if (this.tagName === 'VIDEO' && n === 'src') {
      window.__ev.push({k:'rmSrc', was:(this.getAttribute('src')||'').split('/').pop(), st:(new Error().stack||'').split('\\n').slice(1,6).join(' <- ')});
    }
    return ora.apply(this, arguments);
  };
  var ol = HTMLMediaElement.prototype.load;
  HTMLMediaElement.prototype.load = function(){
    if (this.tagName === 'VIDEO') window.__ev.push({k:'load', src:(this.getAttribute('src')||'(none)').split('/').pop(), st:(new Error().stack||'').split('\\n').slice(1,6).join(' <- ')});
    return ol.apply(this, arguments);
  };
})()`,
})

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(9000)

console.log('--- 页面里的 video ---')
console.log(await evalJs(`JSON.stringify([...document.querySelectorAll('video')].map(x=>({attr:x.getAttribute('src'), rs:x.readyState, ns:x.networkState, paused:x.paused, t:+x.currentTime.toFixed(2)})))`))

console.log('\n--- 摘 src / load 事件 ---')
const ev = await evalJs(`JSON.stringify(window.__ev, null, 1)`)
console.log(ev)

ws.close(); chrome.kill(); process.exit(0)
