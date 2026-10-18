/**
 * 从 story.js / ui.js 提取【四语】文案，生成配音脚本与合成清单。
 *
 * 设计要点（踩过坑后确定的做法）：
 *  - VO 编号 / 类型 / 说话者 一律以【中文】切句结果为准，其余三语只提供文本。
 *    这样四语永不出现分类冲突，编号也能和已交付的中英脚本保持一致。
 *  - 逐块（\n\n 分隔）对齐：块内其他语言句数 == 中文组数 → 逐条对应；
 *    不等 → 按句子顺序均分成同样份数（翻译忠实，这种情况极少）。
 *
 * 输出：
 *   output/voice-script/配音脚本-四语对照.csv
 *   output/voice-overs/_manifest.json   （供 synth_voice.mjs 合成音频）
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { CHAPTERS, ENDINGS } from '../glacier-messenger-h5/src/story/story.js'
import { UI } from '../glacier-messenger-h5/src/i18n/ui.js'

const OUT_SCRIPT = 'C:/Users/-/Desktop/冰川信使海外版/output/voice-script'
const OUT_VO = 'C:/Users/-/Desktop/冰川信使海外版/output/voice-overs'

const LANGS = ['zh', 'en', 'ja', 'fr']

/* ────────────── 切句 ────────────── */
// 引号一律用 toggle：直引号 " 同时是开/闭引号，按「开/闭分别置位」会卡死状态
const OPEN_Q = new Set(['"', '“', '「', '«'])
const CLOSE_Q = new Set(['"', '”', '」', '»'])

function splitSentences(text, lang) {
  if (!text) return []
  const src = String(text).replace(/\\n/g, '\n')
  const blocks = src.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const b of blocks) {
    let buf = ''
    let inQuote = false
    for (let i = 0; i < b.length; i += 1) {
      const c = b[i]
      if (c === '"') inQuote = !inQuote
      else if ('“「«'.includes(c)) inQuote = true
      else if ('”」»'.includes(c)) inQuote = false
      buf += c
      if (inQuote) continue
      let cut = false
      if (lang === 'zh') {
        if ('。！？；'.includes(c)) cut = true
        else if (c === '…' && b[i + 1] !== '…') cut = true
      } else if (lang === 'ja') {
        if ('。！？'.includes(c)) cut = true
        else if (c === '…' && b[i + 1] !== '…') cut = true
      } else {
        // en / fr：句末标点须后接空白或串尾，避免把 3.5、Dr. 切断
        if ('.!?'.includes(c) && /[\s"”»]/.test(b[i + 1] || ' ')) cut = true
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

/* ────────────── 分类（四语各自判定，再按类型对齐） ────────────── */
// 台词允许动作尾缀，如：雪翼（翎羽震颤）："……"（突然警觉地昂首）
// 各语言引号与冒号写法不同：zh “” / en "" / ja 「」 / fr « »
const DIALOGUE_RE = {
  zh: /^([^\s（(：:]{1,12})(?:（[^）]*）)?\s*[：:]\s*[“"](.+?)[”"]\s*((?:（|\()[^\n]*)?$/,
  en: /^([A-Z][A-Za-z'’\- ]{0,24}?)\s*(?:\([^)]*\))?:\s*"(.+?)"\s*(\([^\n]*)?$/,
  ja: /^([^\s（(：:]{1,12})(?:（[^）]*）)?\s*[：:]\s*[「"](.+?)[」"]\s*((?:（|\()[^\n]*)?$/,
  fr: /^([A-ZÀ-Ÿ][\p{L}\p{M}'’\- ]{0,24}?)\s*(?:\([^)]*\))?\s*:\s*[«"](.+?)[»"]\s*(\([^\n]*)?$/u,
}
const VISUAL_RE = {
  zh: /^(镜头|画面|远景|近景|中景|特写|航拍|俯拍|仰拍|摄像机|场景|淡入|淡出|切至|转场|闪回|字幕|屏幕|地图|视角|只见|可见|定格|慢镜)/,
  en: /^(The camera|Camera|A camera|Close-up|Closeup|Wide shot|Aerial|The scene|Scene|We see|The view|Cut to|Fade|Cut|Flashback|Split screen|Overlay|The frame)/i,
  ja: /^(カメラ|画面|遠景|近景|中景|クローズアップ|アップ|シーン|視点|フェード|カット|映像|空撮)/,
  fr: /^(La caméra|Caméra|Une caméra|Gros plan|Plan large|Plan|La scène|Scène|Nous voyons|On voit|La vue|Coupe|Fondu|Image|Vue aérienne)/i,
}

function classify(s, lang) {
  const re = DIALOGUE_RE[lang]
  const d = re ? re.exec(s) : null
  if (d) {
    const tail = (d[3] || '').trim()
    return {
      type: 'dialogue',
      speaker: d[1].trim(),
      line: (d[2].trim() + (tail ? ' ' + tail : '')).trim(),
    }
  }
  if (VISUAL_RE[lang] && VISUAL_RE[lang].test(s)) return { type: 'visual', line: s }
  return { type: 'narration', line: s }
}

/* 句子拼接分隔符：CJK 不加空格，拉丁语系必须加（否则 TTS 会把 "apart.A" 连读） */
const SEP = { zh: '', ja: '', en: ' ', fr: ' ' }
const sepOf = (lang) => SEP[lang] ?? ' '

/* 连续同类句子合并成段；台词按说话者合并 */
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
  return groups.map((g) => ({ type: g.type, speaker: g.speaker, text: g.parts.join(sepOf(lang)) }))
}

/**
 * 把某语言的分组结果，按中文的类型序列重新切配。
 * 例：中文 [visual, narration]，而英文是 [visual, narration, narration]
 *     → 后两个 narration 合并，得到 [visual, narration]，与中文一一对应。
 */
function alignToTypes(groups, types, lang) {
  const sep = sepOf(lang)
  const out = []
  let gi = 0
  for (const t of types) {
    const buf = []
    while (gi < groups.length && groups[gi].type === t) {
      buf.push(groups[gi].text)
      gi += 1
    }
    out.push(buf.join(sep))
  }
  // 还有剩余（类型序列不一致）→ 全部并入最后一组，避免丢字
  if (gi < groups.length) {
    const rest = groups.slice(gi).map((g) => g.text).join(sep)
    out[out.length - 1] = (out[out.length - 1] || '') + (out[out.length - 1] ? sep : '') + rest
  }
  return out
}

/* 把 n 份以外的句子均分成 n 份（兜底） */
function distribute(sentences, n, lang) {
  const sep = sepOf(lang)
  if (n <= 0) return []
  if (sentences.length === n) return sentences
  if (sentences.length === 0) return Array(n).fill('')
  const out = []
  const base = Math.floor(sentences.length / n)
  const extra = sentences.length % n
  let idx = 0
  for (let i = 0; i < n; i += 1) {
    const take = base + (i < extra ? 1 : 0)
    out.push(sentences.slice(idx, idx + take).join(sep))
    idx += take
  }
  return out
}

const blocksOf = (t) =>
  String(t || '').replace(/\\n/g, '\n').split(/\n+/).map((s) => s.trim()).filter(Boolean)

/**
 * 四语对齐：以中文 block→group 为骨架，其余语言逐块对齐。
 * 返回 [{type, speaker, zh, en, ja, fr}]
 */
function alignFour(texts) {
  // texts: {zh, en, ja, fr}
  const zb = blocksOf(texts.zh)
  const other = {}
  for (const L of ['en', 'ja', 'fr']) other[L] = blocksOf(texts[L])
  const out = []
  let exact = 0
  let byType = 0
  let fallback = 0
  const n = zb.length
  for (let i = 0; i < n; i += 1) {
    const zg = groupSentences(splitSentences(zb[i] || '', 'zh'), 'zh')
    if (!zg.length) continue
    const types = zg.map((g) => g.type)
    const groupsOf = {}
    for (const L of ['en', 'ja', 'fr']) {
      groupsOf[L] = groupSentences(splitSentences(other[L][i] || '', L), L)
    }
    const filled = {}
    let mode = 'exact'
    for (const L of ['en', 'ja', 'fr']) {
      const g = groupsOf[L]
      if (g.length === zg.length) {
        filled[L] = g.map((x) => x.text)
      } else {
        const t = alignToTypes(g, types, L)
        // 类型对齐若留下空槽，说明类型序列不一致 → 退回按句均分
        if (t.some((x, k) => !x && types[k] !== 'dialogue')) {
          filled[L] = distribute(splitSentences(other[L][i] || '', L), zg.length, L)
          mode = 'fallback'
        } else {
          filled[L] = t
          mode = mode === 'fallback' ? mode : 'byType'
        }
      }
    }
    if (mode === 'exact') exact += 1
    else if (mode === 'byType') byType += 1
    else fallback += 1
    for (let k = 0; k < zg.length; k += 1) {
      out.push({
        type: zg[k].type,
        speaker: zg[k].speaker,
        zh: zg[k].text,
        en: filled.en[k] || '',
        ja: filled.ja[k] || '',
        fr: filled.fr[k] || '',
      })
    }
  }
  alignFour.stat = alignFour.stat || { exact: 0, byType: 0, fallback: 0 }
  alignFour.stat.exact += exact
  alignFour.stat.byType += byType
  alignFour.stat.fallback += fallback
  return out
}

/* ────────────── 时长估算 ────────────── */
// 中文 250 字/分；日文 300 字/分；英文 140 词/分；法文 150 词/分
function estSec(text, lang) {
  if (!text) return 0
  if (lang === 'zh') {
    const chars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    return Math.round((chars / 250) * 60 * 10) / 10
  }
  if (lang === 'ja') {
    const chars = (text.replace(/\s/g, '').match(/[^\s]/g) || []).length
    return Math.round((chars / 300) * 60 * 10) / 10
  }
  const words = (text.match(/[A-Za-zÀ-ÿ'’\-]+/g) || []).length
  const wpm = lang === 'fr' ? 150 : 140
  return Math.round((words / wpm) * 60 * 10) / 10
}

/* ────────────── 收集 ────────────── */
const rows = []
let seq = 0
// key = 该条 VO 在 story.js 中的来源位置，供游戏运行时按章/按选项查配音，如 'chapter:1:desc'
const push = (scene, type, speaker, texts, key = '') => {
  const t = {
    zh: (texts.zh || '').trim(),
    en: (texts.en || '').trim(),
    ja: (texts.ja || '').trim(),
    fr: (texts.fr || '').trim(),
  }
  if (!t.zh && !t.en && !t.ja && !t.fr) return
  seq += 1
  rows.push({
    id: 'VO-' + String(seq).padStart(3, '0'),
    key,
    scene,
    type,
    speaker: speaker || '',
    ...t,
  })
}

/* 把一组 alignFour 结果登记到同一 key 下（保持顺序） */
const pushGroup = (scene, segs, key) => {
  for (const seg of segs) push(scene, seg.type, seg.speaker, seg, key)
}

const pick = (o) => ({ zh: o?.zh || '', en: o?.en || '', ja: o?.ja || '', fr: o?.fr || '' })

for (const ch of CHAPTERS) {
  const scene = `第${ch.id}章 ${ch.title.zh} / ${ch.title.en}`
  push(scene, 'chapter-title', '', pick(ch.title), `chapter:${ch.id}:title`)
  pushGroup(scene, alignFour(pick(ch.description)), `chapter:${ch.id}:desc`)
  for (const c of ch.choices) {
    push(scene, 'choice', '', pick(c.text), `choice:${c.id}:text`)
    if (c.description) pushGroup(scene, alignFour(pick(c.description)), `choice:${c.id}:desc`)
    if (c.consequences) push(scene, 'consequence', '', pick(c.consequences), `choice:${c.id}:cons`)
    if (c.conditionHint) push(scene, 'condition', '', pick(c.conditionHint), `choice:${c.id}:cond`)
  }
}

for (const [key, e] of Object.entries(ENDINGS)) {
  const scene = `结局 · ${e.title.zh} / ${e.title.en} (${key})`
  push(scene, 'ending-title', '', pick(e.title), `ending:${key}:title`)
  pushGroup(scene, alignFour(pick(e.description)), `ending:${key}:desc`)
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
  const o = {
    zh: typeof UI.zh?.[k] === 'string' ? UI.zh[k] : '',
    en: typeof UI.en?.[k] === 'string' ? UI.en[k] : '',
    ja: typeof UI.ja?.[k] === 'string' ? UI.ja[k] : '',
    fr: typeof UI.fr?.[k] === 'string' ? UI.fr[k] : '',
  }
  if (o.zh || o.en || o.ja || o.fr) push('UI 界面文案', 'ui', '', o, `ui:${k}`)
}

/* ────────────── 输出 ────────────── */
mkdirSync(OUT_SCRIPT, { recursive: true })
mkdirSync(OUT_VO, { recursive: true })

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

const csvCell = (s) => `"${String(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`

let csv =
  '\uFEFF编号,场景,类型,说话者,中文,English,日本語,Français,中文时长(秒),EN时长(秒),JA时长(秒),FR时长(秒)\n'
for (const r of rows) {
  csv += [
    csvCell(r.id), csvCell(r.scene), csvCell(TYPE_LABEL[r.type]), csvCell(r.speaker),
    csvCell(r.zh), csvCell(r.en), csvCell(r.ja), csvCell(r.fr),
    estSec(r.zh, 'zh'), estSec(r.en, 'en'), estSec(r.ja, 'ja'), estSec(r.fr, 'fr'),
  ].join(',') + '\n'
}
writeFileSync(`${OUT_SCRIPT}/配音脚本-四语对照.csv`, csv, 'utf-8')

/* 合成清单 */
const manifest = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  langs: LANGS,
  items: rows.map((r) => ({
    id: r.id,
    key: r.key,
    scene: r.scene,
    type: r.type,
    typeLabel: TYPE_LABEL[r.type],
    speaker: r.speaker,
    texts: { zh: r.zh, en: r.en, ja: r.ja, fr: r.fr },
    est: { zh: estSec(r.zh, 'zh'), en: estSec(r.en, 'en'), ja: estSec(r.ja, 'ja'), fr: estSec(r.fr, 'fr') },
  })),
}

/* 位置 → VO 编号列表（游戏运行时按此查配音，如 chapter:1:desc → [VO-002, VO-003, ...]） */
const map = {}
for (const r of rows) {
  if (!r.key) continue
  ;(map[r.key] = map[r.key] || []).push(r.id)
}
manifest.map = map

/* 编号 → 条目（游戏按 id 取文本做字幕） */
const byId = {}
for (const r of rows) {
  byId[r.id] = { t: { zh: r.zh, en: r.en, ja: r.ja, fr: r.fr }, type: r.type, speaker: r.speaker }
}
manifest.byId = byId

writeFileSync(`${OUT_VO}/_manifest.json`, JSON.stringify(manifest, null, 2), 'utf-8')

/* 供游戏直接 import 的精简运行表（只保留运行时需要的字段） */
const runtime = { map, byId }
writeFileSync(`${OUT_VO}/_vo-runtime.json`, JSON.stringify(runtime), 'utf-8')

/* 统计 */
const byType = {}
let emptyByLang = { zh: 0, en: 0, ja: 0, fr: 0 }
for (const r of rows) {
  byType[r.type] = (byType[r.type] || 0) + 1
  for (const L of LANGS) if (!r[L]) emptyByLang[L] += 1
}
const totals = {}
for (const L of LANGS) {
  totals[L] = Math.round(rows.filter((r) => r.type !== 'visual').reduce((a, r) => a + estSec(r[L], L), 0))
}

console.log('条目总数:', rows.length)
console.log('分类:', JSON.stringify(byType))
console.log('各语言空值条数:', JSON.stringify(emptyByLang))
console.log('四语净时长(秒，不含画面提示):', JSON.stringify(totals))
console.log('块对齐方式(精确/按类型/兜底均分):', JSON.stringify(alignFour.stat || {}))
console.log('输出:', OUT_SCRIPT, '|', OUT_VO)
