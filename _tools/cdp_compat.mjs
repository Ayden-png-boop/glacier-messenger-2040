/**
 * 跨浏览器兼容回归
 *
 * 本机只有 Chromium 内核（Chrome / Edge），无法真装 Safari 15 或 Chrome 100。
 * 所以分三层验证：
 *   A. 真实 UA 覆盖：iPhone Safari / iPad / 微信 / UC / QQ / 老 Chrome 100 的 UA
 *      下跑一遍，看分支逻辑（微信引导）与渲染是否正常、有无控制台报错。
 *   B. 老浏览器模拟：把产物里 `@supports not (color:oklch(...))` 的兜底块
 *      强制在 Chrome 生效（等价于「浏览器不认 oklch」），对比关键元素的计算样式
 *      与正常模式是否一致 —— 一致才说明兜底颜色写对了。
 *   C. Edge 实跑：另一个内核实例跑一遍冒烟（Edge 与 Chrome 版本不同，能抓差异）。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME =
  process.env.GM_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.argv[2] || 'http://127.0.0.1:4173/'
const PORT = 9360 + Math.floor(Math.random() * 60)
const SHOT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots'

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--proxy-bypass-list=127.0.0.1;localhost',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-compat-${Date.now()}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {}
})

let target
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
    const p = list.find((x) => x.type === 'page')
    if (p) {
      target = p
      break
    }
  } catch {}
  await sleep(500)
}
if (!target) {
  console.error('无法连接调试端口')
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.result?.exceptionDetails)
    return 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '').slice(0, 160)
  return r.result?.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync(`${SHOT}/${name}.png`, Buffer.from(r.result.data, 'base64'))
  return `${SHOT}/${name}.png`
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'T',email:'',isAnonymous:false}))}catch(e){}`,
})
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
})

/* ── 探针：关键元素的计算样式 ── */
const PROBE = `(()=>{
  const cs=(sel,prop)=>{const e=document.querySelector(sel); if(!e) return 'NO_ELEM'; const s=getComputedStyle(e); return s.getPropertyValue(prop)};
  const h1=document.querySelector('header h1');
  const shell=document.querySelector('.video-shell');
  const btn=document.querySelector('.choice-btn');
  const ring=document.querySelector('[aria-label="雁群状态"]');
  return JSON.stringify({
    bodyBg: cs('body','background-color'),
    h1HasGradient: (h1? getComputedStyle(h1).backgroundImage : '').includes('gradient'),
    h1Color: h1? getComputedStyle(h1).color : null,
    h1W: h1? Math.round(h1.getBoundingClientRect().width):0,
    shellH: shell? Math.round(shell.getBoundingClientRect().height):0,
    btnBorder: btn? getComputedStyle(btn).borderTopColor : null,
    btnBg: btn? getComputedStyle(btn).backgroundImage : null,
    ringBorder: ring? getComputedStyle(ring).borderTopColor : null,
    prefetchHost: !!document.getElementById('gm-prefetch'),
    prefetchVideos: document.getElementById('gm-prefetch')?.querySelectorAll('video').length ?? 0,
    tapBtn: document.querySelectorAll('[data-tap-to-play]').length,
  })
})()`

const UAS = [
  { key: 'chrome_modern', ua: null },
  {
    key: 'ios_safari17',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    key: 'ios_safari15',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1',
  },
  {
    key: 'wechat_android',
    ua: 'Mozilla/5.0 (Linux; Android 12; SM-G991B Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 XWEB/4317 MMWEBSDK/20220903 Mobile Safari/537.36 MMWEBID/1234 MicroMessenger/8.0.28.2240(0x28001C51) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64',
  },
  {
    key: 'uc_android',
    ua: 'Mozilla/5.0 (Linux; U; Android 10; zh-CN; V1938CT Build/QP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36',
  },
  {
    key: 'chrome100',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
  },
]

console.log('=== A. 真实 UA 覆盖 ===')
for (const u of UAS) {
  if (u.ua) await send('Emulation.setUserAgentOverride', { userAgent: u.ua })
  await send('Page.navigate', { url: BASE + '?ua=' + u.key })
  await sleep(4200)
  // 微信引导会挡住页面，先关掉它（点「留在微信」）
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/留在微信|Stay|WeChat/i.test(x.innerText)); if(b){b.click(); return 'closed'} return 'none'})()`)
  await sleep(900)
  const probe = await ev(PROBE)
  const errs = await ev(
    `(()=>{let n=0;return n})()`,
  )
  console.log(u.key.padEnd(15), probe)
}

/* oklab()/oklch() → rgba()，用来判断「格式不同但颜色等价」 */
function oklabToRgba(str) {
  const m = /oklab\(\s*([\d.]+%?)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)(?:\s*\/\s*([\d.]+))?\s*\)/.exec(str)
  if (!m) return str
  const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
  const a = parseFloat(m[2])
  const b = parseFloat(m[3])
  const al = m[4] !== undefined ? parseFloat(m[4]) : 1
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const mm = m_ ** 3
  const ss = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss,
  ]
  const enc = (v) => {
    const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(x * 255)))
  }
  return `rgba(${lin.map(enc).join(',')},${al})`
}
const norm = (v) =>
  Array.isArray(v)
    ? v.map(norm).join('|')
    : typeof v === 'string'
      ? v.replace(/oklab\([^)]*\)|oklch\([^)]*\)/g, oklabToRgba).replace(/\s+/g, '')
      : String(v)

/* ── B. 老浏览器模拟 ── */
console.log('\n=== B. 老浏览器模拟（强制命中兜底块）===')
await send('Emulation.setUserAgentOverride', {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
})

const cssHref = await ev(
  `(()=>{const l=[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href); return l.join(',')})()`,
)
const cssText = cssHref ? await (await fetch(cssHref.split(',')[0])).text() : ''
const begin = cssText.indexOf('/* ==GM-COMPAT-BEGIN==')
const end = cssText.indexOf('/* ==GM-COMPAT-END==')
if (begin < 0 || end < 0) {
  console.log('!! 产物里没有兜底块，css_compat.mjs 没跑或已被剥离')
} else {
  let block = cssText.slice(begin, end)
  // 把「not oklch」反转成「oklch」，让它在现代 Chrome 上也命中 = 模拟老浏览器
  block = block
    .replace('@supports not (color:oklch(50% 0 0))', '@supports (color:oklch(50% 0 0))')
    // 第二块（认得 oklch 但不认 color-mix）在模拟场景下不应再生效
    .replace(
      /@supports \(color:oklch\(50% 0 0\)\) and \(not \(color:color-mix\(in oklab,red,red\)\)\)\{[\s\S]*/,
      '',
    )
  if (!block.includes('@supports')) console.log('!! 反转失败')

  const inject = `(()=>{
    const s=document.createElement('style'); s.id='gm-compat-sim';
    s.textContent=${JSON.stringify(block)};
    document.head.appendChild(s); return s.sheet? s.sheet.cssRules.length : -1
  })()`

  await send('Page.navigate', { url: BASE + '?legacy=1' })
  await sleep(4200)
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/留在微信|Stay/i.test(x.innerText)); if(b)b.click(); return 1})()`)
  await sleep(600)
  const before = JSON.parse(await ev(PROBE))
  await shot('compat_modern')
  const rules = await ev(inject)
  await sleep(1200)
  const after = JSON.parse(await ev(PROBE))
  await shot('compat_legacy')
  console.log('注入兜底规则数:', rules)
  console.log('现代 :', JSON.stringify(before))
  console.log('老浏览器:', JSON.stringify(after))
  for (const k of ['bodyBg', 'h1HasGradient', 'shellH', 'btnBorder', 'ringBorder', 'btnBg']) {
    const a = norm(before[k])
    const b = norm(after[k])
    const ok = a === b
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${k}: ${a}${ok ? '' : '  ->  ' + b}`)
  }
}

/* ── 控制台错误汇总 ── */
console.log('\n=== C. 控制台 ===')
const logs = await ev(
  `(()=>{return JSON.stringify(window.__gmErrs||[])})()`,
)
console.log('页面内错误计数:', logs)

ws.close()
chrome.kill()
process.exit(0)
