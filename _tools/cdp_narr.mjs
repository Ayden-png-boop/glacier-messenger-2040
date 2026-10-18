/**
 * 两个新功能的回归：
 *   A. 旁白默认只显示「当前一句」，可展开全文（折叠态要跟着配音走）
 *   B. 旁白念完 + 正片播过一遍后仍未选择 → 自动弹出催选弹窗（内含选项）
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const OUT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/narr'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9351

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--proxy-bypass-list=127.0.0.1;localhost',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-narr-${Date.now()}`,
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
  source: `try{localStorage.setItem('gm_identity', JSON.stringify({name:'NarrTest',email:'',isAnonymous:false}))}catch(e){}`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const spans = () => evalJs(`document.querySelectorAll('p.story-text [data-vo-id]').length`)
const shownText = () => evalJs(`document.querySelector('p.story-text')?.innerText.slice(0, 40) || '(none)'`)
const activeId = () => evalJs(`document.querySelector('p.story-text')?.dataset.voActive || '(none)'`)
const toggleText = () => evalJs(`document.querySelector('[data-narration-toggle]')?.innerText.replace(/\\s+/g,' ') || '(no toggle)'`)
const promptOpen = () => evalJs(`!!document.querySelector('[data-choice-prompt]')`)

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(8000)

console.log('\n--- 1. 折叠态：只显示一句 ---')
console.log('  段落内句子数 =', await spans(), '(期望 1)')
console.log('  当前文本     =', await shownText())
console.log('  高亮 id      =', await activeId())
console.log('  展开按钮     =', await toggleText())

console.log('\n--- 2. 折叠态要跟着配音走（采样 3 次）---')
for (let i = 0; i < 3; i += 1) {
  console.log(`  #${i} active=${await activeId()} 文本=${await shownText()}`)
  await sleep(3500)
}

console.log('\n--- 3. 点「展开全文」---')
console.log('  点击 =', await evalJs(`(()=>{const b=document.querySelector('[data-narration-toggle]');if(!b)return 'NO_BTN';b.click();return 'clicked'})()`))
await sleep(600)
console.log('  段落内句子数 =', await spans(), '(期望 >1)')
console.log('  按钮         =', await toggleText())
const shotOpen = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${OUT}_expanded.png`, Buffer.from(shotOpen.result.data, 'base64'))

console.log('\n--- 4. 再点「收起」---')
console.log('  点击 =', await evalJs(`(()=>{const b=document.querySelector('[data-narration-toggle]');b.click();return 'clicked'})()`))
await sleep(600)
console.log('  段落内句子数 =', await spans(), '(期望 1)')
const shotClosed = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${OUT}_collapsed.png`, Buffer.from(shotClosed.result.data, 'base64'))

console.log('\n--- 5. 等「旁白念完 + 正片播完」自动催选（最多 75s）---')
let opened = false
for (let i = 0; i < 25; i += 1) {
  await sleep(3000)
  const p = await promptOpen()
  const act = await activeId()
  if (i % 3 === 0 || p) console.log(`  t+${(i + 1) * 3}s 弹窗=${p} active=${act}`)
  if (p) { opened = true; break }
}
console.log('  弹窗出现 =', opened, '(期望 true)')
console.log('  弹窗内选项数 =', await evalJs(`document.querySelectorAll('[data-choice-prompt] [data-choice-id]').length`))
console.log('  弹窗文案 =', await evalJs(`document.querySelector('[data-choice-prompt]')?.innerText.split('\\n').slice(0,3).join(' | ')`))
const shotPrompt = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${OUT}_prompt.png`, Buffer.from(shotPrompt.result.data, 'base64'))

console.log('\n--- 6. 在弹窗里直接选，应进入过场并关弹窗 ---')
const picked = await evalJs(`(()=>{const b=[...document.querySelectorAll('[data-choice-prompt] [data-choice-id]')].find(x=>!x.disabled); if(!b) return 'NO_CHOICE'; b.click(); return b.dataset.choiceId})()`)
console.log('  点击 =', picked)
await sleep(1500)
console.log('  弹窗已关 =', (await promptOpen()) === false)
console.log('  过场浮层 =', await evalJs(`!!document.querySelector('.fixed.inset-0.z-50')`))
await sleep(11000)
console.log('  已进入 =', await evalJs(`(document.body.innerText.match(/第\\s*\\d+\\s*章[^\\n]*/)||['(未匹配)'])[0]`))
console.log('  新章弹窗 =', await promptOpen(), '(期望 false，刚进章还没看完)')

console.log('\n--- 7. 控制台错误 ---')
console.log('  错误数:', errs.length, JSON.stringify(errs.slice(0, 6)))

ws.close(); chrome.kill(); process.exit(0)
