/** 线上站点冒烟测试：真实浏览器打开 https://redspiderbc.cn/Ayden-BHG/national/ */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] || 'https://redspiderbc.cn/Ayden-BHG/national/'
const SHOT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/live_smoke.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'
const PORT = 9311

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--proxy-server=${PROXY}`,
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-live-${Date.now()}`,
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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'EVAL_ERR: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '')
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'SmokeTest',email:'',isAnonymous:false}))}catch(e){}`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(6000)

console.log('--- 1. 首屏结构 ---')
console.log(await evalJs(`JSON.stringify({h1: document.querySelector('h1')?.textContent?.slice(0,30), h2: document.querySelector('h2')?.textContent, btns: document.querySelectorAll('button').length, vids: document.querySelectorAll('video').length, title: document.title})`))

await sleep(15000)
console.log('--- 2. 视频加载状态 ---')
console.log(await evalJs(`(()=>{const v=document.querySelector('video'); if(!v) return 'NO_VIDEO'; const p=performance.getEntriesByType('resource').filter(r=>r.name.includes('/videos/')); return JSON.stringify({src:(v.currentSrc||v.src).split('/').pop(), readyState:v.readyState, currentTime:+v.currentTime.toFixed(2), paused:v.paused, opacity:getComputedStyle(v).opacity, videoOpacityClass:v.classList.contains('ready'), buffered: v.buffered.length? +v.buffered.end(0).toFixed(2):0, videoReqs:p.length, posterLoaded: [...document.images].filter(i=>i.src.includes('posters')&&i.naturalWidth>0).length})})()`))

console.log('--- 3. 点击第一个选项，推进章节 ---')
console.log('选择前:', await evalJs(`document.querySelector('h2')?.textContent`))
await evalJs(`(()=>{const b=[...document.querySelectorAll('button[data-choice-id]')][0]; if(!b) return 'NO_CHOICE_BTN'; b.click(); return 'clicked:'+b.dataset.choiceId})()`)
await sleep(20000)
console.log('选择后:', await evalJs(`JSON.stringify({chapter: document.querySelector('h2')?.textContent, hasEnding: !!document.body.textContent.match(/结局|Ending|Final/), vids: document.querySelectorAll('video').length})`))

console.log('--- 4. 网络与错误 ---')
const perf = await evalJs(`JSON.stringify((()=>{const r=performance.getEntriesByType('resource'); const g=(k)=>r.filter(x=>x.name.includes(k)).length; return {total:r.length, videos:g('/videos/'), posters:g('posters/'), js:g('/assets/')}})())`)
console.log('资源:', perf)
console.log('错误:', JSON.stringify(errs.slice(0, 8)))

const s = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(SHOT, Buffer.from(s.result.data, 'base64'))
console.log('截图 ->', SHOT)

ws.close(); chrome.kill(); process.exit(0)
