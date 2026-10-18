/**
 * 两个 bug 的回归验证：
 *   A. 选择选项后，章节旁白必须立刻停（不能再念到下一章）
 *   B. 过场浮层里的后果视频必须真的播出来（不是一直转圈 / 黑屏）
 *
 * 做法：patch HTMLMediaElement.play/pause 记录每一次调用，
 * 这样能证明「点了选项之后，旧的配音音频确实被 pause 了」，而不是只看 UI 状态。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const SHOT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/vfix.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9331

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:55955'}`,
  '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-vfix-${Date.now()}`,
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
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'FixTest',email:'',isAnonymous:false}))}catch(e){}
(function(){
  window.__log = [];
  var P = HTMLMediaElement.prototype;
  var op = P.play, opa = P.pause;
  P.play = function(){ window.__log.push({a:'play', tag:this.tagName, src:(this.currentSrc||this.src||'').split('/').pop()}); return op.apply(this, arguments); };
  P.pause = function(){ window.__log.push({a:'pause', tag:this.tagName, src:(this.currentSrc||this.src||'').split('/').pop()}); return opa.apply(this, arguments); };
})()`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const dumpVideos = () =>
  evalJs(`JSON.stringify([...document.querySelectorAll('video')].map(x=>({src:(x.getAttribute('src')||x.currentSrc||'').split('/').pop().slice(0,24), rs:x.readyState, ns:x.networkState, paused:x.paused, t:+x.currentTime.toFixed(2), w:x.videoWidth, err:x.error?x.error.code:null})))`)
const voActive = () => evalJs(`document.querySelector('p.story-text')?.dataset.voActive || '(none)'`)

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(9000)

console.log('\n--- 1. 章节正片 + 旁白起播 ---')
console.log('  videos@6s =', await dumpVideos())
await sleep(4000)
console.log('  videos@10s =', await dumpVideos(), ' (t 应有推进)')
console.log('  activeId =', await voActive())
console.log('  媒体调用 =', await evalJs(`JSON.stringify(window.__log.slice(-6))`))

console.log('\n--- 2. 点击第一个选项 ---')
const clicked = await evalJs(`(()=>{const b=[...document.querySelectorAll('button[data-choice-id]')].find(x=>!x.disabled); if(!b) return 'NO_CHOICE'; b.click(); return b.dataset.choiceId})()`)
console.log('  点击 choice =', clicked)
await sleep(1200)

console.log('\n--- 3. 【修复A】点选项后旁白必须停 ---')
console.log('  activeId =', await voActive(), '  (期望空)')
console.log('  暂停/播放调用 =', await evalJs(`JSON.stringify(window.__log.filter(x=>x.tag==='AUDIO').slice(-8))`))

console.log('\n--- 4. 【修复B】浮层后果视频是否真在播（每 2s 采样） ---')
for (let i = 0; i < 6; i += 1) {
  const v = await dumpVideos()
  const overlay = await evalJs(`!!document.querySelector('.fixed.inset-0.z-50')`)
  console.log(`  t+${1.2 + i * 2}s  浮层=${overlay}  ${v}`)
  if (!overlay) break
  await sleep(2000)
}

console.log('\n--- 5. 过场结束，是否进入下一章 ---')
await sleep(3000)
console.log('  章节标题 =', await evalJs(`(document.body.innerText.match(/第\\s*\\d+\\s*章[^\\n]*/)||['(未匹配)'])[0]`))
console.log('  activeId =', await voActive(), '  (期望非空，且是新章)')
console.log('  videos =', await dumpVideos())

console.log('\n--- 6. 再点一个选项，确认稳定复现 ---')
await sleep(4000)
console.log('  点击 =', await evalJs(`(()=>{const b=[...document.querySelectorAll('button[data-choice-id]')].find(x=>!x.disabled); if(!b) return 'NO_CHOICE'; b.click(); return b.dataset.choiceId})()`))
await sleep(1500)
console.log('  activeId =', await voActive(), '  (期望空)')
console.log('  浮层视频 =', await dumpVideos())
await sleep(9000)
console.log('  进入 =', await evalJs(`(document.body.innerText.match(/第\\s*\\d+\\s*章[^\\n]*/)||['(未匹配/结局)'])[0]`))

console.log('\n--- 7. 控制台错误 ---')
console.log('  错误数:', errs.length, JSON.stringify(errs.slice(0, 6)))

const s = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(SHOT, Buffer.from(s.result.data, 'base64'))
console.log('截图 ->', SHOT)

ws.close(); chrome.kill(); process.exit(0)
