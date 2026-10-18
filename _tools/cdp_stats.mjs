/**
 * 统计后台 + 游戏播报 端到端验证（真实浏览器）
 *   1. 游戏页：是否上报 hello/beat/stats.live；播报条是否显示
 *   2. 后台页：登录校验 → 看板 KPI / 图表 / 表格是否渲染
 *   3. 全程收集控制台错误
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const GAME = process.argv[2] || 'http://127.0.0.1:5273/'
const ADMIN = process.argv[3] || 'http://127.0.0.1:8787/'
const SHOT_GAME = 'C:/Users/-/Desktop/冰川信使海外版/_shots/stats_game.png'
const SHOT_ADMIN = 'C:/Users/-/Desktop/冰川信使海外版/_shots/stats_admin.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9323

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'}`,
    '--proxy-bypass-list=127.0.0.1;localhost',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-stats-${Date.now()}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {}
})

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
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})

let id = 0
const pend = new Map()
const errs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown')
    errs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || '').split('\n')[0])
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errs.push('CONSOLE: ' + JSON.stringify(m.params.args?.map((a) => a.value || a.description)))
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const mid = ++id
    pend.set(mid, r)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  })
  return r.result?.result?.value
}
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) writeFileSync(file, Buffer.from(r.result.data, 'base64'))
}

await send('Runtime.enable')
await send('Page.enable')

/* ────────────── 1. 游戏页 ────────────── */
console.log('【1】游戏页统计上报')
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
})
await send('Page.navigate', { url: GAME })
await sleep(6000)

console.log('  注册弹窗:', await evalJs(`(()=>{
  const cb = document.querySelector('input[type=checkbox]');
  const btn = [...document.querySelectorAll('button')].find(x=>/开始游戏/.test(x.textContent));
  if (!btn) return 'none';
  if (cb && !cb.checked) cb.click();
  setTimeout(()=>btn.click(), 120);
  return 'started';
})()`))
await sleep(2500)

console.log('  上报请求:', await evalJs(`JSON.stringify(performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/')).map(r=>r.name.split('/api/')[1]))`))
console.log('  播报文本:', await evalJs(`(()=>{const el=[...document.querySelectorAll('div')].filter(d=>d.children.length<=3).find(d=>/正在游玩/.test(d.textContent)); return el? el.textContent.trim() : '(未渲染)'})()`))
await shot(SHOT_GAME)

/* ────────────── 2. 后台页 ────────────── */
console.log('\n【2】后台登录')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.navigate', { url: ADMIN })
await sleep(3000)

console.log('  登录页可见:', await evalJs(`document.body.innerText.includes('数据管理后台')`))
console.log(
  '  输入框数量:',
  await evalJs(`document.querySelectorAll('input').length`),
)

// 错误密码先试一次，确认会被拒绝
await evalJs(`(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))}; const i=[...document.querySelectorAll('input')]; set(i[0],'管理员'); set(i[1],'000000'); return 'filled'})()`)
await sleep(300)
await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/登/.test(x.textContent)); if(b){b.click(); return 'clicked'} return 'NO_BTN'})()`)
await sleep(1800)
console.log('  错密码提示:', await evalJs(`(()=>{const t=document.body.innerText; const m=t.match(/账号或密码不正确/); return m? '已拒绝 ✓' : '未拒绝 ✗'})()`))

// 正确密码
await evalJs(`(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))}; const i=[...document.querySelectorAll('input')]; set(i[0],'${process.env.GM_ADMIN_USER || "管理员"}'); set(i[1],'${process.env.GM_ADMIN_PASS || ""}'); return 'filled'})()`)
await sleep(300)
await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/登/.test(x.textContent)); if(b){b.click(); return 'clicked'} return 'NO_BTN'})()`)
await sleep(4500)

console.log('\n【3】看板渲染')
console.log('  是否登录成功:', await evalJs(`document.body.innerText.includes('数据后台')`))
console.log('  KPI 卡片文本:', await evalJs(`(()=>{const t=document.body.innerText; return (t.match(/累计访客（含游客）[\\s\\S]{0,30}/)||['(无)'])[0].replace(/\\n/g,' | ')})()`))
console.log('  SVG 图表数:', await evalJs(`document.querySelectorAll('svg').length`))
console.log('  表格行数:', await evalJs(`document.querySelectorAll('tbody tr').length`))
console.log(
  '  访客明细首行:',
  await evalJs(`(()=>{const r=document.querySelector('tbody tr'); return r? r.innerText.replace(/\\t/g,' | ') : '(无)'})()`),
)
await shot(SHOT_ADMIN)

/* ────────────── 3. 刷新后是否保持登录 ────────────── */
console.log('\n【4】刷新保持登录')
await send('Page.navigate', { url: ADMIN })
await sleep(3500)
console.log('  刷新后仍在看板:', await evalJs(`document.body.innerText.includes('累计访客')`))

console.log('\n控制台错误:', errs.length ? errs.slice(0, 8) : '无')
process.exit(0)
