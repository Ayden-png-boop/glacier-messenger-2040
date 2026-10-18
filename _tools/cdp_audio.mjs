/**
 * 声音链路验证：
 *   A. 浮层（点选项后弹出）里的后果视频必须带声音 —— 之前漏传 muted，恒为静音
 *   B. 开局点击「开始游戏」是一次真实手势，应自动解除静音
 *   C. 声音开关必须真的作用到页面上正在播的视频
 *
 * 判据直接读 DOM 属性（muted / volume / paused），不看 UI 文案。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] || 'http://127.0.0.1:4174/'
const SHOT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/audio.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9341

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  // 不放宽自动播放策略：要验证的就是「无手势静音 → 手势后开声」这条真实链路
  `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'}`,
  '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-audio-${Date.now()}`,
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

/* 只清掉身份，让注册弹窗出现（它提供真实手势）；gm_muted 刻意不预设 */
await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.removeItem('gm_identity'); localStorage.removeItem('gm_muted')}catch(e){}`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: false })

/* 真实手势点击：脚本里 element.click() 不带用户激活，
   浏览器的自动播放策略不认它 —— 必须用 Input.dispatchMouseEvent。 */
async function realClick(expr) {
  await evalJs(`(()=>{const e=(${expr}); if(e&&e.scrollIntoView) e.scrollIntoView({block:'center'}); return 1})()`)
  await sleep(300)
  const box = await evalJs(`(()=>{const e=(${expr}); if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x+b.width/2), y:Math.round(b.y+b.height/2)}})()`)
  if (!box || typeof box !== 'object') return '(no element)'
  // 视口外（y<0 或 y>844）的点不会命中，直接报出来免得误判成「点击无效」
  if (box.y < 0 || box.y > 844) return `(视口外 ${box.x},${box.y})`
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    /* eslint-disable-next-line no-await-in-loop */
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  return `(${box.x},${box.y})`
}

const dump = () =>
  evalJs(`JSON.stringify([...document.querySelectorAll('video')].map(x=>({
    src:(x.getAttribute('src')||x.currentSrc||'').split('/').pop().slice(0,26),
    muted:x.muted, vol:+x.volume.toFixed(2), paused:x.paused,
    t:+x.currentTime.toFixed(2), rs:x.readyState, vis:!!x.offsetParent
  })))`)
const hasOverlay = () => evalJs(`!!document.querySelector('.fixed.inset-0.z-50')`)
/* 声音按钮是纯图标，只有 aria-label 上有文案 */
const soundBtn = () => evalJs(`(()=>{const b=document.querySelector('button[aria-label]'); return b? b.getAttribute('aria-label'):'(none)'})()`)

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(8000)

console.log('\n--- 1. 首屏（注册弹窗未点，理应静音起播） ---')
console.log('  弹窗 =', await evalJs(`!!document.querySelector('.animate-pop')`))
console.log('  videos =', await dump())

console.log('\n--- 2. 匿名进入（真实手势）---')
// 必须先勾匿名：不勾的话姓名必填，校验拦下 submit，注册流程根本走不完
console.log('  勾选匿名 =', await realClick(`document.querySelector('#isAnonymous')`))
await sleep(400)
console.log('  点击 =', await realClick(`[...document.querySelectorAll('button')].find(x=>/开始游戏|Start|始める|Commencer/.test(x.textContent||''))`))
await sleep(2500)
console.log('  弹窗已关 =', await evalJs(`!document.querySelector('.animate-pop')`))
console.log('  所有按钮 =', await evalJs(`JSON.stringify([...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(Boolean))`))
console.log('  声音按钮 =', await soundBtn(), '  (期望「静音」，即已开声)')
console.log('  videos =', await dump(), '  (期望 muted:false)')

console.log('\n--- 3. 点选项 → 浮层后果片 ---')
console.log('  choice =', await evalJs(`(()=>{const b=[...document.querySelectorAll('button[data-choice-id]')].find(x=>!x.disabled); return b?b.dataset.choiceId:'NO_CHOICE'})()`))
console.log('  点击 =', await realClick(`[...document.querySelectorAll('button[data-choice-id]')].find(x=>!x.disabled)`))
await sleep(1500)
console.log('  浮层 =', await hasOverlay())
console.log('  videos =', await dump(), '  ← 浮层那支必须 muted:false')
await sleep(2500)
console.log('  t+4s videos =', await dump())

console.log('\n--- 4. 开声状态下浮层片是否在推进 ---')
for (let i = 0; i < 4; i += 1) {
  console.log(`  采样${i}:`, await dump())
  await sleep(1800)
}

console.log('\n--- 5. 声音开关：点一下应就地静音 ---')
console.log('  点击 =', await realClick(`document.querySelector('button[aria-label]')`))
await sleep(1200)
console.log('  声音按钮 =', await soundBtn())
console.log('  videos =', await dump(), '  (期望 muted:true)')

console.log('\n--- 6. 控制台错误 ---')
console.log('  错误数:', errs.length, JSON.stringify(errs.slice(0, 6)))

const s = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(SHOT, Buffer.from(s.result.data, 'base64'))
console.log('截图 ->', SHOT)

ws.close(); chrome.kill(); process.exit(0)
