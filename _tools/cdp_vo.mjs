/**
 * 配音接入验证：真实浏览器打开游戏，检查
 *   1. 章节描述被切成字幕句（span[data-vo-id]）
 *   2. 旁白按序播放（data-vo-active 会从 VO-003 推进到后续条目）
 *   3. 确实发起了 voice/*.mp3 请求
 *   4. 切语言后改请求对应语言的音频
 *   5. 控制台零报错
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const SHOT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/vo_test.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9322

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  // 线上走本机代理；本地 static 服务器必须绕过，否则 127.0.0.1 也会被代理劫走
  `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'}`,
  '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-vo-${Date.now()}`,
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
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'VOTest',email:'',isAnonymous:false}))}catch(e){}`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(6000)

console.log('--- 1. 字幕句切分 ---')
console.log(await evalJs(`JSON.stringify({spans: document.querySelectorAll('span[data-vo-id]').length, ids: [...document.querySelectorAll('span[data-vo-id]')].map(s=>s.dataset.voId), text: (document.querySelector('p.story-text')?.textContent||'').slice(0,80)})`))

console.log('--- 2. 播放推进（每 4s 采样一次 activeId） ---')
for (let i = 0; i < 5; i += 1) {
  const a = await evalJs(`document.querySelector('p.story-text')?.dataset.voActive || '(none)'`)
  console.log(`  t+${4 + i * 4}s  activeId=${a}`)
  await sleep(4000)
}

console.log('--- 3. 音频请求 ---')
console.log(await evalJs(`JSON.stringify(performance.getEntriesByType('resource').filter(r=>r.name.includes('/voice/')).map(r=>({f:r.name.split('/voice/')[1], size:r.transferSize||r.encodedBodySize||0})))`))

console.log('--- 4. 切到日语后重新请求 ---')
// 语言切换器是 <select aria-label="language">，不是 button
console.log('  切换前 html lang=', await evalJs(`document.documentElement.lang`))
console.log('  切换结果=', await evalJs(`(()=>{const s=document.querySelector('select[aria-label="language"]'); if(!s) return 'NO_SELECT'; s.value='ja'; s.dispatchEvent(new Event('change',{bubbles:true})); return 'set:'+s.value})()`))
await sleep(7000)
console.log('  切换后 html lang=', await evalJs(`document.documentElement.lang`))
console.log('  activeId=', await evalJs(`document.querySelector('p.story-text')?.dataset.voActive || '(none)'`))
console.log('  日文字幕=', await evalJs(`(document.querySelector('p.story-text')?.textContent||'').slice(0,40)`))
console.log('  ja请求=', await evalJs(`JSON.stringify(performance.getEntriesByType('resource').filter(r=>r.name.includes('/voice/ja/')).map(r=>r.name.split('/voice/ja/')[1]))`))

console.log('--- 5. 错误 ---')
console.log('错误数:', errs.length, JSON.stringify(errs.slice(0, 5)))

const s = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(SHOT, Buffer.from(s.result.data, 'base64'))
console.log('截图 ->', SHOT)

ws.close(); chrome.kill(); process.exit(0)
