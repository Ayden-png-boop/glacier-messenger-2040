/**
 * 自动播放回归：模拟手机内核的严格自动播放策略。
 *
 * Chrome 默认放行静音自动播放，本地跑什么都「正常」，看不出手机上的问题。
 * 这里用 --autoplay-policy=document-user-activation-required + iPhone UA/触摸仿真，
 * 复现「无手势就拒播」的真机行为，检查三件事：
 *   1. 首屏：视频即便暂时被拒，也不能出现任何「轻触播放」入口；
 *   2. 一次真实触摸后：画面必须自己动起来（pause=false 且 currentTime 在走）；
 *   3. 选完选项、浮层关闭回到章节：正片必须自动接着播（这是之前最容易卡住的地方——
 *      浮层打开时上层主动 pause()，pause 事件会把它误判成「播放失败」）。
 *
 * 用法: node cdp_autoplay.mjs [url]
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, mkdirSync } from 'node:fs'

const URL = process.argv[2] || 'http://127.0.0.1:4177/'
const OUT = process.argv[3] || 'C:/Users/-/Desktop/冰川信使海外版/_shots/autoplay'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9369
mkdirSync(OUT, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--mute-audio',
    // 关键：模拟手机「必须有用户手势才允许播放」
    '--autoplay-policy=document-user-activation-required',
    '--proxy-bypass-list=127.0.0.1;localhost',
    '--window-size=390,844',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=C:/Users/-/AppData/Local/Temp/cr-autoplay-${Date.now()}`,
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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails)
    return 'EVAL_ERR: ' + (r.result.exceptionDetails.exception?.description || '')
  return r.result?.result?.value
}
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, 'base64'))
}

/* 真实触摸：CDP 的 Input 事件算 user activation，脚本 element.click() 不算 */
const tapAt = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const tapEl = async (expr) => {
  await evalJs(`(()=>{const e=(${expr}); if(e&&e.scrollIntoView) e.scrollIntoView({block:'center'}); return 1})()`)
  await sleep(350)
  const box = await evalJs(
    `(()=>{const e=(${expr}); if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x+b.width/2), y:Math.round(b.y+b.height/2), h:window.innerHeight}})()`,
  )
  if (!box || typeof box !== 'object') return '(no element)'
  if (box.y < 0 || box.y > box.h) return `(视口外 ${box.y}/${box.h})`
  await tapAt(box.x, box.y)
  return `(${box.x},${box.y})`
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
})
await send('Emulation.setUserAgentOverride', {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  acceptLanguage: 'zh-CN,zh;q=0.9',
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{
    localStorage.setItem('gm_identity', JSON.stringify({name:'AutoTest',email:'',isAnonymous:false}))
    localStorage.setItem('gm_muted','false')   // 玩家开着声音：手机内核最容易被拒的状态
    localStorage.setItem('gm_wechat_ok','true')
  }catch(e){}`,
})

const SNAP = `(() => {
  const shell = document.querySelector('.video-shell')
  const v = shell && shell.querySelector('video')
  const tapBtn = document.querySelector('[data-tap-to-play]')
  const txt = document.body.innerText || ''
  return JSON.stringify({
    ch: (document.querySelector('h2')?.textContent || '').trim().slice(0, 22),
    hasV: !!v,
    paused: v ? v.paused : null,
    ct: v ? Math.round(v.currentTime * 100) / 100 : null,
    rs: v ? v.readyState : null,
    muted: v ? v.muted : null,
    err: v && v.error ? v.error.code : null,
    frames: v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames : null,
    tapBtn: !!tapBtn,
    tapText: /轻触播放|Tap to play|タップして再生|Appuyez pour lire/.test(txt),
    overlay: !!document.querySelector('.fixed.inset-0.z-50'),
  })
})()`
const snap = async () => JSON.parse(await evalJs(SNAP))

console.log('打开:', URL)
await send('Page.navigate', { url: URL })
await sleep(10000)

const fails = []
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? '  ' + extra : ''}`)
  if (!cond) fails.push(label)
}

/* ── 1. 首屏：不许出现手动入口 ── */
console.log('\n--- 1. 首屏（无手势）---')
let s = await snap()
console.log('  状态:', JSON.stringify(s))
ok(!s.tapBtn && !s.tapText, '没有出现「轻触播放」入口')
await shot('1_first_land')

/* ── 2. 一次真实触摸 → 必须自己播起来 ── */
console.log('\n--- 2. 触摸后自动起播 ---')
const pos = await tapEl(`document.querySelector('.video-shell')`)
console.log('  点击:', pos)
await sleep(2500)
const s2 = await snap()
console.log('  状态:', JSON.stringify(s2))
const ct2 = s2.ct
await sleep(1500)
const s3 = await snap()
ok(s3.paused === false, '视频处于播放状态', `paused=${s3.paused}`)
ok(s3.ct !== ct2, '画面在推进', `${ct2} → ${s3.ct}`)
ok(!s3.tapBtn && !s3.tapText, '仍然没有任何手动入口')
await shot('2_after_tap')

/* ── 3. 选项 → 浮层 → 新章节：正片必须自动续播 ── */
console.log('\n--- 3. 选完选项回到章节后自动续播 ---')
let step = 0
for (let round = 0; round < 4; round += 1) {
  const info = JSON.parse(
    await evalJs(`(() => {
      const btns = [...document.querySelectorAll('button.choice-btn')].filter((b) => !b.disabled)
      return JSON.stringify({ n: btns.length, h2: (document.querySelector('h2')?.textContent || '').trim().slice(0, 22) })
    })()`),
  )
  if (!info.n) {
    console.log('  无选项，结束')
    break
  }
  step += 1
  const picked = await tapEl(`[...document.querySelectorAll('button.choice-btn')].filter(b=>!b.disabled)[0]`)
  console.log(`  [${step}] ${info.h2} → 点选项 ${picked}`)

  // 浮层期间：正片被上层主动 pause，这是预期行为（不该被自动补播打断）
  await sleep(1200)
  const ov = await snap()
  console.log('    浮层中:', JSON.stringify(ov))

  // 等换章 + 浮层关闭；第 3 章会弹 QTE，顺手点掉（不然流程会停在这里）
  let landed = false
  for (let i = 0; i < 50; i += 1) {
    await sleep(700)
    const qte = JSON.parse(
      await evalJs(`(() => {
        const tgt = document.querySelectorAll('.qte-target')
        const start = [...document.querySelectorAll('button')].find((b) =>
          /开始突袭|Begin the Raid|襲撃開始|Lancer le raid/.test(b.textContent || ''),
        )
        const done = [...document.querySelectorAll('button')].find((b) =>
          /正在模拟后果|Simulating consequences|結果をシミュレーション中|Simulation des conséquences/.test(b.textContent || ''),
        )
        return JSON.stringify({ targets: tgt.length, start: !!start, done: !!done })
      })()`),
    )
    if (qte.start) {
      console.log('    QTE：点开始')
      await tapEl(`[...document.querySelectorAll('button')].find((b)=>/开始突袭|Begin the Raid|襲撃開始|Lancer le raid/.test(b.textContent||''))`)
      continue
    }
    if (qte.targets) {
      await tapEl(`document.querySelector('.qte-target')`)
      continue
    }
    if (qte.done) {
      console.log('    QTE：结算')
      await tapEl(`[...document.querySelectorAll('button')].find((b)=>/正在模拟后果|Simulating consequences|結果をシミュレーション中|Simulation des conséquences/.test(b.textContent||''))`)
      continue
    }
    s = await snap()
    if (!s.overlay && s.ch && s.ch !== info.h2) {
      landed = true
      break
    }
  }
  if (!landed) {
    console.log('    ⚠ 未检测到换章')
    break
  }
  // 落地后 4 秒内必须自己在播
  let playing = false
  let lastCt = null
  let moved = false
  for (let i = 0; i < 8; i += 1) {
    s = await snap()
    if (s.paused === false) playing = true
    if (lastCt != null && s.ct !== lastCt) moved = true
    lastCt = s.ct
    if (playing && moved) break
    await sleep(500)
  }
  console.log(`    落地: ${JSON.stringify(s)}`)
  ok(playing, `第 ${step} 次换章后视频自动播放`)
  ok(moved, `第 ${step} 次换章后画面在推进`)
  ok(!s.tapBtn && !s.tapText, `第 ${step} 次换章后没有手动入口`)
  await shot(`3_step${step}`)
}

console.log('\n--- 控制台错误 ---')
console.log(errs.length, JSON.stringify(errs.slice(0, 6)))
console.log('\n--- 结论 ---')
console.log(fails.length ? `❌ ${fails.length} 项未通过: ${fails.join(' / ')}` : '✅ 全部通过')
console.log('截图目录:', OUT)
ws.close()
chrome.kill()
process.exit(0)
