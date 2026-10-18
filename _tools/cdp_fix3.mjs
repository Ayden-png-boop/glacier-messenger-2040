/* 校验三项改动：
   A. .safe-x 修复 —— 无安全区机型左右应有 16px 留白（原来被 env() 覆盖成 0）
   B. 封面 WebP→JPG 兜底 —— picture/source 结构、jpg 可访问、webp 为首选
   C. diag.html 自检页可访问且脚本无语法错误
*/
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.GM_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.argv[2] || 'http://127.0.0.1:4173/'
const PORT = 9430 + Math.floor(Math.random() * 40)
const extra = BASE.includes('redspiderbc') ? ['--proxy-server=http://127.0.0.1:55955'] : []
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', ...extra, '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-fix-${Date.now()}`,
  'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

let tg
for (let i = 0; i < 40; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) { tg = p; break } } catch {}
  await sleep(500)
}
const ws = new WebSocket(tg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  return r.result?.exceptionDetails ? 'ERR ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 160) : r.result?.result?.value
}
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('gm_identity',JSON.stringify({name:'F',email:'',isAnonymous:false}))}catch(e){}` })

const errs = []
ws.onmessage_captured = true
await send('Log.enable').catch(() => {})

/* ── A. safe-x 留白 ── */
console.log('== A. 左右留白（.safe-x 修复）==')
for (const w of [360, 390, 768, 1280]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 640 })
  await send('Page.navigate', { url: BASE }); await sleep(3200)
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/留在微信|Stay/i.test(x.innerText)); if(b)b.click(); return 1})()`)
  await sleep(600)
  const r = await ev(`(()=>{
    const c=document.querySelector('.safe-x');
    const h1=document.querySelector('header h1');
    const cs=c?getComputedStyle(c):null;
    const hr=h1?h1.getBoundingClientRect():null;
    return JSON.stringify({
      padL: cs?cs.paddingLeft:null, padR: cs?cs.paddingRight:null,
      h1Left: hr?Math.round(hr.left):null,
      h1Right: hr?Math.round(hr.right):null,
      winW: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    })})()`)
  console.log(`  ${w}px  ${r}`)
}

/* ── B. 封面兜底 ── */
console.log('== B. 封面 WebP / JPG 兜底 ==')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: BASE })
await sleep(3500)
console.log('  picture 结构:', await ev(`(()=>{
  const pic=document.querySelector('.video-shell picture');
  if(!pic) return 'NO_PICTURE';
  const src=pic.querySelector('source');
  const img=pic.querySelector('img');
  return JSON.stringify({source:src?src.getAttribute('srcset'):null, type:src?src.getAttribute('type'):null,
    imgSrc:img?img.getAttribute('src'):null, currentSrc:img?img.currentSrc:null,
    naturalW:img?img.naturalWidth:null})
})()`))
const jpgUrl = BASE.replace(/\/$/, '') + '/posters/ch01_glacier_crack.jpg'
console.log('  jpg 直取:', await ev(`(async()=>{try{const r=await fetch('${jpgUrl}');return r.status+' '+r.headers.get('content-type')+' '+(await r.blob()).size+'B'}catch(e){return 'ERR '+e.message}})()`))

/* ── C. diag.html ── */
console.log('== C. diag.html 自检页 ==')
const diagUrl = BASE.replace(/\/$/, '') + '/diag.html'
await send('Page.navigate', { url: diagUrl }); await sleep(2500)
console.log('  表格行数:', await ev(`document.querySelectorAll('table td').length`))
console.log('  三块是否都填充:', await ev(`['#t-ua','#t-css','#t-media'].map(s=>document.querySelectorAll(s+' tr').length).join('/')`))
console.log('  内核一行:', await ev(`document.querySelector('#t-ua tr td:nth-child(2)')?.innerText`))
console.log('  页面错误:', await ev(`JSON.stringify(window.__errs||[])`))

/* 回到游戏页收一次全量错误 */
await send('Page.navigate', { url: BASE }); await sleep(4000)
console.log('== 游戏页错误 ==')
console.log('  ', await ev(`JSON.stringify(window.__errs||[])`))
ws.close(); chrome.kill(); process.exit(0)
