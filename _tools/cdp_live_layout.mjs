/**
 * 版式回归：标题左上、雁群状态右上（迷你）、章节正片在旁白之上。
 * 分别按桌面窗口(1280x800)与手机(390x844)两种视口截图并量元素位置。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] || 'https://redspiderbc.cn/Ayden-BHG/national/'
const OUT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/live_final'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9341

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--proxy-server=http://127.0.0.1:55955','--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-layout-${Date.now()}`,
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
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'LayoutTest',email:'',isAnonymous:false}));localStorage.setItem('gm_muted','true')}catch(e){}`,
})

const box = (sel) =>
  evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NULL'; const r=e.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)})})()`)

const report = async (label, w, h, mobile, file) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile })
  await send('Page.navigate', { url: URL })
  await sleep(7000)
  console.log(`\n=== ${label} ${w}x${h} ===`)
  console.log('  h1 标题      =', await box('h1'))
  console.log('  雁群状态栏    =', await box('[aria-label="雁群状态"]'))
  console.log('  语言选择器    =', await box('header select'))
  console.log('  章节视频      =', await box('.video-shell'))
  console.log('  旁白段落      =', await box('p.story-text'))
  const rel = await evalJs(`(()=>{const v=document.querySelector('.video-shell'),p=document.querySelector('p.story-text');if(!v||!p)return 'NULL';return v.getBoundingClientRect().bottom <= p.getBoundingClientRect().top ? '视频在旁白之上 OK' : '视频在旁白之下 ✗'})()`)
  console.log('  上下关系      =', rel)
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(s.result.data, 'base64'))
  console.log('  截图 ->', file)
}

await report('桌面窗口', 1280, 800, false, `${OUT}_desktop.png`)
await report('手机视口', 390, 844, true, `${OUT}_mobile.png`)

console.log('\n控制台错误:', errs.length, JSON.stringify(errs.slice(0, 5)))
ws.close(); chrome.kill(); process.exit(0)
