/**
 * 从 story.js / ui.js 提取全部中英文案，生成配音脚本。
 * 输出：
 *   - 配音脚本-中英对照.md   分场景对照脚本（旁白/台词/画面提示分类，含时长估算）
 *   - 配音脚本-中英对照.csv   可直接导入表格的清单
 *   - 配音脚本-中文.txt       纯中文录音稿
 *   - 配音脚本-英文.txt       纯英文录音稿
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { CHAPTERS, ENDINGS } from '../glacier-messenger-h5/src/story/story.js'
import { UI } from '../glacier-messenger-h5/src/i18n/ui.js'

const OUT = 'C:/Users/-/Desktop/冰川信使海外版/output/voice-script'

/* ────────────── 句子切分 ────────────── */
/**
 * 逐字符扫描切句：跟踪引号状态，引号内的标点（如台词里的省略号 ……）
 * 一律不切分，保证台词整句完整可识别。
 */
function splitSentences(text, lang) {
  if (!text) return []
  const src = String(text).replace(/\\n/g, '\n')
  const blocks = src.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const out = []
  const OPEN = new Set(['"', '“', '「'])
  const CLOSE = new Set(['"', '”', '」'])
  for (const b of blocks) {
    let buf = ''
    let inQuote = false
    for (let i = 0; i < b.length; i += 1) {
      const c = b[i]
      // 直引号 " 同时用作开/闭 → 必须用 toggle，否则状态会卡死
      if (c === '"') inQuote = !inQuote
      else if ('“「'.includes(c)) inQuote = true
      else if ('”」'.includes(c)) inQuote = false
      buf += c
      if (inQuote) continue
      let cut = false
      if (lang === 'zh') {
        if ('。！？；'.includes(c)) cut = true
        else if (c === '…' && b[i + 1] !== '…') cut = true
      } else {
        if ('.!?'.includes(c) && /[\s"]/.test(b[i + 1] || ' ')) cut = true
        else if (c === '…' && b[i + 1] !== '…') cut = true
      }
      if (cut) {
        const s = buf.trim()
        if (s) out.push(s)
        buf = ''
      }
    }
    const tail = buf.trim()
    if (tail) out.push(tail)
  }
  return out
}

/* ────────────── 分类：台词 / 画面提示 / 旁白 ────────────── */
// 允许台词后跟动作尾缀，如：赤瞳（尾巴一甩）："……"（它用尾巴划出一条红线）
const DIALOGUE_RE = {
  zh: /^([^\s（(：:]{1,12})(?:（[^）]*）)?\s*[：:]\s*[“"](.+?)[”"]\s*((?:（|\()[^\n]*)?$/,
  en: /^([A-Z][A-Za-z'’\- ]{0,24}?)\s*(?:\([^)]*\))?:\s*"(.+?)"\s*(\([^\n]*)?$/,
}
const VISUAL_RE = {
  zh: /^(镜头|画面|远景|近景|中景|特写|航拍|俯拍|仰拍|摄像机|场景|淡入|淡出|切至|转场|闪回|字幕|屏幕|地图|视角|只见|可见|定格|慢镜)/,
  en: /^(The camera|Camera|A camera|Close-up|Closeup|Wide shot|Aerial|The scene|Scene|We see|The view|Cut to|Fade|Cut|Flashback|Split screen|Overlay|The frame)/i,
}
function classify(s, lang) {
  const d = DIALOGUE_RE[lang].exec(s)
  if (d) {
    const tail = (d[3] || '').trim()
    return { type: 'dialogue', speaker: d[1].trim(), line: (d[2].trim() + (tail ? ' ' + tail : '')).trim() }
  }
  if (VISUAL_RE[lang].test(s)) return { type: 'visual', line: s }
  return { type: 'narration', line: s }
}

/* 连续同类句子合并成段 */
function groupSentences(sentences, lang) {
  const groups = []
  for (const s of sentences) {
    const c = classify(s, lang)
    const last = groups[groups.length - 1]
    if (c.type !== 'dialogue' && last && last.type === c.type) {
      last.parts.push(c.line)
    } else if (c.type === 'dialogue' && last && last.type === 'dialogue' && last.speaker === c.speaker) {
      last.parts.push(c.line)
    } else {
      groups.push({ type: c.type, speaker: c.speaker || null, parts: [c.line] })
    }
  }
  return groups.map((g) => ({ type: g.type, speaker: g.speaker, text: g.parts.join('') }))
}

/**
 * 中英对齐（按段落块配对，块内再逐句对齐）：
 *  - 块内分组数一致 → 逐条一一对应（最理想）
 *  - 不一致 → 台词按出现顺序配对，旁白/画面提示各自合并成一条
 * 这样可保证中英对照永不错位。
 */
function alignPair(zhText, enText) {
  const blocksOf = (t) => String(t || '').replace(/\\n/g, '\n').split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const zb = blocksOf(zhText)
  const eb = blocksOf(enText)
  const out = []
  const n = Math.max(zb.length, eb.length)
  for (let i = 0; i < n; i += 1) {
    const zg = groupSentences(splitSentences(zb[i] || '', 'zh'), 'zh')
    const eg = groupSentences(splitSentences(eb[i] || '', 'en'), 'en')
    if (zg.length && zg.length === eg.length) {
      for (let k = 0; k < zg.length; k += 1) {
        out.push({ type: zg[k].type, speaker: zg[k].speaker, zh: zg[k].text, en: eg[k].text })
      }
      continue
    }
    const merge = (gs, type) => gs.filter((g) => g.type === type).map((g) => g.text).join('')
    const zD = zg.filter((g) => g.type === 'dialogue')
    const eD = eg.filter((g) => g.type === 'dialogue')
    let dDone = false
    let nDone = false
    let vDone = false
    for (const g of zg) {
      if (g.type === 'narration') {
        if (nDone) continue
        nDone = true
        out.push({ type: 'narration', speaker: null, zh: merge(zg, 'narration'), en: merge(eg, 'narration') })
      } else if (g.type === 'visual') {
        if (vDone) continue
        vDone = true
        out.push({ type: 'visual', speaker: null, zh: merge(zg, 'visual'), en: merge(eg, 'visual') })
      } else {
        if (dDone) continue
        dDone = true
        const m = Math.max(zD.length, eD.length)
        for (let k = 0; k < m; k += 1) {
          out.push({
            type: 'dialogue',
            speaker: zD[k]?.speaker || eD[k]?.speaker || null,
            zh: zD[k]?.text || '',
            en: eD[k]?.text || '',
          })
        }
      }
    }
  }
  return out
}

/* ────────────── 时长估算 ────────────── */
// 中文播音 ≈ 250 字/分钟；英文 ≈ 140 词/分钟
function estSec(text, lang) {
  if (!text) return 0
  if (lang === 'zh') {
    const chars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    return Math.round((chars / 250) * 60 * 10) / 10
  }
  const words = (text.match(/[A-Za-z'’-]+/g) || []).length
  return Math.round((words / 140) * 60 * 10) / 10
}

/* ────────────── 收集条目 ────────────── */
const rows = [] // {id, scene, type, speaker, zh, en}
let n = 0
const push = (scene, type, speaker, zh, en) => {
  if (!zh && !en) return
  n += 1
  rows.push({
    id: 'VO-' + String(n).padStart(3, '0'),
    scene,
    type,
    speaker: speaker || '',
    zh: (zh || '').trim(),
    en: (en || '').trim(),
  })
}

/* 章节 */
for (const ch of CHAPTERS) {
  const scene = `第${ch.id}章 ${ch.title.zh} / ${ch.title.en}`
  push(scene, 'chapter-title', '', ch.title.zh, ch.title.en)

  for (const seg of alignPair(ch.description.zh, ch.description.en)) {
    push(scene, seg.type, seg.speaker, seg.zh, seg.en)
  }

  for (const c of ch.choices) {
    push(scene, 'choice', '', c.text.zh, c.text.en)
    if (c.description) {
      for (const seg of alignPair(c.description.zh, c.description.en)) {
        push(scene, seg.type, seg.speaker, seg.zh, seg.en)
      }
    }
    if (c.consequences) push(scene, 'consequence', '', c.consequences.zh, c.consequences.en)
    if (c.conditionHint) push(scene, 'condition', '', c.conditionHint.zh, c.conditionHint.en)
  }
}

/* 结局 */
for (const [key, e] of Object.entries(ENDINGS)) {
  const scene = `结局 · ${e.title.zh} / ${e.title.en} (${key})`
  push(scene, 'ending-title', '', e.title.zh, e.title.en)
  for (const seg of alignPair(e.description.zh, e.description.en)) {
    push(scene, seg.type, seg.speaker, seg.zh, seg.en)
  }
}

/* UI 短句（附录，按需配音） */
const UI_KEYS = [
  'title', 'subtitle', 'flockStatus', 'cooperation', 'radical', 'health',
  'choicePrompt', 'finalStats', 'totalScore', 'scoreGrade', 'restart',
  'loadingScene', 'chooseScene', 'welcomeTitle', 'welcomeSubtitle',
  'anonymous', 'nameLabel', 'namePlaceholder', 'emailLabel', 'emailPlaceholder',
  'startGame', 'startAnonymous', 'privacy',
]
for (const k of UI_KEYS) {
  const zh = UI.zh?.[k]
  const en = UI.en?.[k]
  if (zh || en) push('UI 界面文案', 'ui', '', typeof zh === 'string' ? zh : '', typeof en === 'string' ? en : '')
}

/* ────────────── 输出 ────────────── */
mkdirSync(OUT, { recursive: true })

const TYPE_LABEL = {
  narration: '旁白',
  dialogue: '角色台词',
  visual: '画面提示（不配音）',
  'chapter-title': '章节标题',
  'ending-title': '结局标题',
  choice: '选项',
  consequence: '后果提示',
  condition: '条件提示',
  ui: 'UI 文案',
}

const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const csvCell = (s) => `"${String(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`

let md = `# 《冰川信使：斑头雁的2040》配音脚本（中英对照）

> 自动提取自 \`src/story/story.js\` 与 \`src/i18n/ui.js\`，共 **${rows.length}** 条。
> 分类说明：**旁白** = 需配音的叙述；**角色台词** = 需配音的对白（已标说话者）；**画面提示** = 镜头调度说明，仅作参考，不配音。
> 时长按中文 250 字/分钟、英文 140 词/分钟估算，实际以录音为准。

---

`

let curScene = ''
for (const r of rows) {
  if (r.scene !== curScene) {
    curScene = r.scene
    md += `\n## ${curScene}\n\n`
    md += `| 编号 | 类型 | 说话者 | 中文 | English | 中文时长 | EN 时长 |\n`
    md += `|---|---|---|---|---|---|---|\n`
  }
  const sp = r.speaker ? r.speaker : '—'
  md += `| ${r.id} | ${TYPE_LABEL[r.type]} | ${sp} | ${esc(r.zh)} | ${esc(r.en)} | ${estSec(r.zh, 'zh')}s | ${estSec(r.en, 'en')}s |\n`
}

const totalZh = rows.reduce((a, r) => (r.type === 'visual' ? a : a + estSec(r.zh, 'zh')), 0)
const totalEn = rows.reduce((a, r) => (r.type === 'visual' ? a : a + estSec(r.en, 'en')), 0)
const cnt = { narration: 0, dialogue: 0, visual: 0 }
rows.forEach((r) => { if (cnt[r.type] != null) cnt[r.type] += 1 })

md += `
---

## 汇总

| 项目 | 数量 |
|---|---|
| 总条目 | ${rows.length} |
| 旁白 | ${cnt.narration} |
| 角色台词 | ${cnt.dialogue} |
| 画面提示（不配音） | ${cnt.visual} |
| 中文净配音时长（估） | ${Math.round(totalZh)} 秒 ≈ ${Math.floor(totalZh / 60)} 分 ${Math.round(totalZh % 60)} 秒 |
| 英文净配音时长（估） | ${Math.round(totalEn)} 秒 ≈ ${Math.floor(totalEn / 60)} 分 ${Math.round(totalEn % 60)} 秒 |

> 净时长不含「画面提示」与 UI 短句之外的停顿，实际录制请预留 15–20% 余量。
`

writeFileSync(`${OUT}/配音脚本-中英对照.md`, md, 'utf-8')

/* CSV */
let csv = '\uFEFF编号,场景,类型,说话者,中文,English,中文时长(秒),EN时长(秒)\n'
for (const r of rows) {
  csv += [
    csvCell(r.id), csvCell(r.scene), csvCell(TYPE_LABEL[r.type]), csvCell(r.speaker),
    csvCell(r.zh), csvCell(r.en), estSec(r.zh, 'zh'), estSec(r.en, 'en'),
  ].join(',') + '\n'
}
writeFileSync(`${OUT}/配音脚本-中英对照.csv`, csv, 'utf-8')

/* 纯文本录音稿 */
const toTxt = (lang) => {
  let t = lang === 'zh'
    ? `《冰川信使：斑头雁的2040》配音脚本 · 中文\n自动生成 · 共 ${rows.length} 条\n${'='.repeat(50)}\n\n`
    : `Glacier Messenger: Bar-headed Goose 2040 — Voice-over Script (English)\nAuto-generated · ${rows.length} entries\n${'='.repeat(50)}\n\n`
  let sc = ''
  for (const r of rows) {
    const body = lang === 'zh' ? r.zh : r.en
    if (!body) continue
    if (r.scene !== sc) { sc = r.scene; t += `\n【${sc}】\n` }
    const tag = r.type === 'visual' ? '[画面提示·不配音] ' : r.speaker ? `[${r.speaker}] ` : '[旁白] '
    t += `${r.id}  ${tag}${body}\n\n`
  }
  return t
}
writeFileSync(`${OUT}/配音脚本-中文.txt`, toTxt('zh'), 'utf-8')
writeFileSync(`${OUT}/配音脚本-英文.txt`, toTxt('en'), 'utf-8')

console.log('条目总数:', rows.length)
console.log('旁白/台词/画面:', cnt.narration, '/', cnt.dialogue, '/', cnt.visual)
console.log('中文净时长(s):', Math.round(totalZh), ' 英文净时长(s):', Math.round(totalEn))
console.log('输出目录:', OUT)
