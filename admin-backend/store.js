/**
 * 数据层：内存索引 + JSON 原子快照持久化（零依赖）
 *
 * 设计取舍：
 * - 全部数据在内存，查询走内存（毫秒级）；每 20s 有变更时落盘一次，写入用 tmp + rename 保证原子性
 * - 只保留活跃会话明细，历史会话压缩成聚合桶，避免文件无限膨胀
 * - 时间键统一用东八区（游戏面向国内用户），不依赖服务器系统时区
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')

const TZ_OFFSET_MS = 8 * 3600 * 1000
const ONLINE_WINDOW_MS = 45 * 1000 // 45s 内有心跳视为在线
const HOUR_KEEP = 24 * 14 // 小时桶保留 14 天
const DAY_KEEP = 400 // 日桶保留 400 天
const SESSION_KEEP = 3000 // 会话明细保留条数

/* ────────────── 时间键 ────────────── */
export const dayKey = (ts) => new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10)
export const hourKey = (ts) => new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 13)
export const todayKey = () => dayKey(Date.now())

/* ────────────── 状态 ────────────── */
const state = {
  visitors: new Map(), // vid -> visitor
  sessions: new Map(), // sid -> session
  hourBuckets: new Map(), // 'YYYY-MM-DDTHH' -> { v:{vid:1}, sessions, sec, newV }
  dayBuckets: new Map(), // 'YYYY-MM-DD'   -> { v:{vid:1}, sessions, sec, newV }
  chapterFunnel: new Map(), // chapterId -> { vid:{vid:1}, n }
  endings: new Map(), // endingKey -> n
  langs: new Map(),
  devices: new Map(),
  live: new Map(), // vid -> { ts, sid, chapter, lang, device }
  seq: 0,
}

let dirty = false
let saving = false

/* ────────────── 设备识别 ────────────── */
function detectDevice(ua) {
  const s = String(ua || '')
  if (/iPad|Tablet|Android.*Tablet/i.test(s)) return '平板'
  if (/Mobile|Android|iPhone|Windows Phone/i.test(s)) return '手机'
  if (/bot|spider|crawler|curl|wget|python/i.test(s)) return '爬虫'
  return '电脑'
}

function detectBrowser(ua) {
  const s = String(ua || '')
  if (/Edg\//.test(s)) return 'Edge'
  if (/Chrome\//.test(s)) return 'Chrome'
  if (/Firefox\//.test(s)) return 'Firefox'
  if (/Safari\//.test(s)) return 'Safari'
  if (/MicroMessenger/.test(s)) return '微信'
  return '其他'
}

/* ────────────── 访客 ────────────── */
function ensureVisitor(vid, meta = {}) {
  let v = state.visitors.get(vid)
  const now = Date.now()
  if (!v) {
    v = {
      vid,
      firstSeen: now,
      lastSeen: now,
      sessions: 0,
      totalSec: 0,
      lang: meta.lang || '',
      device: detectDevice(meta.ua),
      browser: detectBrowser(meta.ua),
      ua: String(meta.ua || '').slice(0, 200),
      ref: String(meta.ref || '').slice(0, 300),
      screen: String(meta.screen || '').slice(0, 30),
      chapters: {}, // chapterId -> 1（去重）
      maxChapter: 0,
      endings: {}, // endingKey -> n
      days: {}, // 活跃天
      played: false, // 是否真正玩过（点过开始 / 到达章节）
    }
    state.visitors.set(vid, v)
    return { v, isNew: true }
  }
  return { v, isNew: false }
}

/* ────────────── 对外：登记访客 ────────────── */
export function hello({ vid, sid, lang, ua, ref, screen }) {
  const now = Date.now()
  const { v, isNew } = ensureVisitor(vid, { lang, ua, ref, screen })
  v.lastSeen = now
  if (lang) v.lang = lang

  const dk = dayKey(now)
  v.days[dk] = 1

  // 日/小时桶：记录「出现过」
  const db = getBucket(state.dayBuckets, dk)
  db.v[vid] = 1
  const hb = getBucket(state.hourBuckets, hourKey(now))
  hb.v[vid] = 1
  if (isNew) {
    db.newV += 1
    hb.newV += 1
  }

  // 会话
  let s = state.sessions.get(sid)
  if (!s) {
    s = {
      sid,
      vid,
      start: now,
      last: now,
      sec: 0,
      chapter: 0,
      lang: lang || '',
      device: detectDevice(ua),
      browser: detectBrowser(ua),
      endings: {},
      day: dk,
    }
    state.sessions.set(sid, s)
    v.sessions += 1
    db.sessions += 1
    hb.sessions += 1
    trimSessions()
  }
  s.last = now

  touchLive(vid, sid, { chapter: s.chapter, lang: s.lang, device: s.device })
  bumpCounter(state.devices, s.device)
  if (lang) bumpCounter(state.langs, lang)

  dirty = true
  return { isNew, session: s }
}

function getBucket(map, key) {
  let b = map.get(key)
  if (!b) {
    b = { v: {}, sessions: 0, sec: 0, newV: 0 }
    map.set(key, b)
  }
  return b
}

function bumpCounter(map, key) {
  if (!key) return
  map.set(key, (map.get(key) || 0) + 1)
}

/* ────────────── 对外：心跳（累计时长） ────────────── */
export function beat({ vid, sid, dSec, chapter, lang }) {
  const now = Date.now()
  const v = state.visitors.get(vid)
  if (!v) return { ok: false, reason: 'unknown-visitor' }
  const s = state.sessions.get(sid)
  if (!s) return { ok: false, reason: 'unknown-session' }

  // dSec 为自上次心跳以来的「有效活跃秒数」（前端已排除后台/隐藏页）
  const add = Math.max(0, Math.min(120, Number(dSec) || 0))
  s.sec += add
  s.last = now
  if (chapter != null) {
    const c = Number(chapter) || 0
    if (c > s.chapter) s.chapter = c
  }
  if (lang) {
    s.lang = lang
    v.lang = lang
  }
  v.totalSec += add
  v.lastSeen = now

  const db = getBucket(state.dayBuckets, dayKey(now))
  db.sec += add
  const hb = getBucket(state.hourBuckets, hourKey(now))
  hb.sec += add

  touchLive(vid, sid, { chapter: s.chapter, lang: s.lang, device: s.device })
  dirty = true
  return { ok: true, sec: s.sec, total: v.totalSec }
}

function touchLive(vid, sid, info) {
  const prev = state.live.get(vid)
  state.live.set(vid, {
    ts: Date.now(),
    sid,
    chapter: info.chapter || 0,
    lang: info.lang || '',
    device: info.device || '',
    start: prev ? prev.start : Date.now(),
  })
}

/* ────────────── 对外：事件 ────────────── */
export function trackEvent({ vid, sid, type, data }) {
  if (!vid) return { ok: false }
  let v = state.visitors.get(vid)

  // 事件可能比 hello 先到达（并发请求不保证顺序）→ 补登记，避免丢掉章节/结局事件
  if (!v) {
    const { v: created, isNew } = ensureVisitor(vid, {})
    v = created
    const now0 = Date.now()
    v.days[dayKey(now0)] = 1
    const db0 = getBucket(state.dayBuckets, dayKey(now0))
    db0.v[vid] = 1
    if (isNew) db0.newV += 1
    const hb0 = getBucket(state.hourBuckets, hourKey(now0))
    hb0.v[vid] = 1
    if (isNew) hb0.newV += 1
  }
  const s = state.sessions.get(sid)
  const now = Date.now()
  const d = data || {}

  if (type === 'start') {
    v.played = true
    if (s) s.played = true
  } else if (type === 'chapter') {
    const id = String(d.id ?? d.chapter ?? '')
    if (id) {
      v.chapters[id] = 1
      const num = Number(id) || 0
      if (num > v.maxChapter) v.maxChapter = num
      let f = state.chapterFunnel.get(id)
      if (!f) {
        f = { vid: {}, n: 0 }
        state.chapterFunnel.set(id, f)
      }
      if (!f.vid[vid]) {
        f.vid[vid] = 1
        f.n += 1
      }
      v.played = true
      if (s) {
        s.chapter = Math.max(s.chapter || 0, num)
        s.played = true
      }
    }
  } else if (type === 'ending') {
    const k = String(d.key ?? d.id ?? '')
    if (k) {
      state.endings.set(k, (state.endings.get(k) || 0) + 1)
      v.endings[k] = (v.endings[k] || 0) + 1
      if (s) s.endings[k] = (s.endings[k] || 0) + 1
    }
  } else if (type === 'lang') {
    if (d.lang) v.lang = d.lang
  }
  v.lastSeen = now
  dirty = true
  return { ok: true }
}

/* ────────────── 在线清理 ────────────── */
export function sweep() {
  const cutoff = Date.now() - ONLINE_WINDOW_MS
  let removed = 0
  for (const [vid, rec] of state.live) {
    if (rec.ts < cutoff) {
      state.live.delete(vid)
      removed += 1
    }
  }
  if (removed) dirty = true
  return removed
}

/* ────────────── 查询：播报 ────────────── */
export function liveStats() {
  sweep()
  let playedTotal = 0
  for (const v of state.visitors.values()) if (v.played) playedTotal += 1
  return {
    online: state.live.size,
    onlinePlaying: countOnlinePlaying(),
    totalVisitors: state.visitors.size,
    totalPlayed: playedTotal,
    todayVisitors: (state.dayBuckets.get(todayKey())?.v
      ? Object.keys(state.dayBuckets.get(todayKey()).v).length
      : 0),
    ts: Date.now(),
  }
}

function countOnlinePlaying() {
  let n = 0
  for (const vid of state.live.keys()) {
    const v = state.visitors.get(vid)
    if (v && v.played) n += 1
  }
  return n
}

/* ────────────── 查询：后台总览 ────────────── */
export function overview({ days = 30 } = {}) {
  sweep()
  const now = Date.now()
  const visitors = [...state.visitors.values()]
  const sessions = [...state.sessions.values()]

  const totalSecAll = visitors.reduce((a, v) => a + v.totalSec, 0)
  const durations = visitors.map((v) => v.totalSec).sort((a, b) => a - b)
  const sessDurations = sessions.map((s) => s.sec).sort((a, b) => a - b)

  const pct = (arr, p) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)

  const d = Math.max(1, Math.min(400, Number(days) || 30))

  // 日趋势
  const daySeries = []
  for (let i = d - 1; i >= 0; i -= 1) {
    const ts = now - i * 86400000
    const k = dayKey(ts)
    const b = state.dayBuckets.get(k)
    daySeries.push({
      day: k,
      visitors: b ? Object.keys(b.v).length : 0,
      newVisitors: b ? b.newV : 0,
      sessions: b ? b.sessions : 0,
      minutes: b ? Math.round(b.sec / 60) : 0,
    })
  }

  // 24 小时趋势
  const hourSeries = []
  for (let i = 23; i >= 0; i -= 1) {
    const ts = now - i * 3600000
    const k = hourKey(ts)
    const b = state.hourBuckets.get(k)
    hourSeries.push({
      hour: k.slice(11),
      label: `${k.slice(11)}:00`,
      visitors: b ? Object.keys(b.v).length : 0,
      sessions: b ? b.sessions : 0,
      minutes: b ? Math.round(b.sec / 60) : 0,
    })
  }

  // 时长分布（按访客累计时长）
  const bucketsDef = [
    { label: '<1分钟', min: 0, max: 60 },
    { label: '1-3分钟', min: 60, max: 180 },
    { label: '3-10分钟', min: 180, max: 600 },
    { label: '10-30分钟', min: 600, max: 1800 },
    { label: '30分钟以上', min: 1800, max: Infinity },
  ]
  const durationDist = bucketsDef.map((b) => ({
    label: b.label,
    count: visitors.filter((v) => v.totalSec >= b.min && v.totalSec < b.max).length,
  }))

  // 章节漏斗
  const funnel = [...state.chapterFunnel.entries()]
    .map(([id, f]) => ({ id, count: f.n }))
    .sort((a, b) => Number(a.id) - Number(b.id))

  const returning = visitors.filter((v) => v.sessions > 1).length
  const played = visitors.filter((v) => v.played).length

  return {
    ts: now,
    totals: {
      visitors: visitors.length,
      played,
      sessions: visitors.reduce((a, v) => a + v.sessions, 0),
      online: state.live.size,
      onlinePlaying: countOnlinePlaying(),
      todayVisitors: daySeries.length ? daySeries[daySeries.length - 1].visitors : 0,
      todayNew: daySeries.length ? daySeries[daySeries.length - 1].newVisitors : 0,
      totalSec: totalSecAll,
      totalHours: +(totalSecAll / 3600).toFixed(1),
      avgSec: Math.round(avg(durations)),
      medianSec: pct(durations, 0.5),
      p90Sec: pct(durations, 0.9),
      avgSessionSec: Math.round(avg(sessDurations)),
      medianSessionSec: pct(sessDurations, 0.5),
      returnRate: visitors.length ? +(returning / visitors.length).toFixed(3) : 0,
      playRate: visitors.length ? +(played / visitors.length).toFixed(3) : 0,
    },
    daySeries,
    hourSeries,
    durationDist,
    funnel,
    endings: [...state.endings.entries()].map(([key, count]) => ({ key, count })),
    langs: [...state.langs.entries()].map(([key, count]) => ({ key, count })),
    devices: [...state.devices.entries()].map(([key, count]) => ({ key, count })),
    onlineList: [...state.live.entries()]
      .map(([vid, r]) => {
        const v = state.visitors.get(vid)
        return {
          vid: vid.slice(0, 8),
          since: r.start,
          sec: Math.round((Date.now() - r.start) / 1000),
          chapter: r.chapter,
          lang: r.lang,
          device: r.device,
          totalSec: v ? v.totalSec : 0,
        }
      })
      .sort((a, b) => b.sec - a.sec),
  }
}

/* ────────────── 查询：访客明细 ────────────── */
export function visitorPage({ page = 1, size = 20, sort = 'lastSeen', order = 'desc' } = {}) {
  const list = [...state.visitors.values()]
  const key = ['totalSec', 'lastSeen', 'firstSeen', 'sessions', 'maxChapter'].includes(sort)
    ? sort
    : 'lastSeen'
  list.sort((a, b) => (order === 'asc' ? a[key] - b[key] : b[key] - a[key]))
  const total = list.length
  const p = Math.max(1, Number(page) || 1)
  const sz = Math.max(1, Math.min(200, Number(size) || 20))
  const start = (p - 1) * sz
  return {
    total,
    page: p,
    size: sz,
    items: list.slice(start, start + sz).map((v) => ({
      vid: v.vid.slice(0, 8),
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      sessions: v.sessions,
      totalSec: v.totalSec,
      maxChapter: v.maxChapter,
      chapters: Object.keys(v.chapters).length,
      endings: Object.keys(v.endings),
      lang: v.lang,
      device: v.device,
      browser: v.browser,
      played: v.played,
      activeDays: Object.keys(v.days).length,
      online: state.live.has(v.vid),
    })),
  }
}

/* ────────────── 会话裁剪 ────────────── */
function trimSessions() {
  if (state.sessions.size <= SESSION_KEEP) return
  const arr = [...state.sessions.values()].sort((a, b) => b.last - a.last)
  const keep = arr.slice(0, SESSION_KEEP)
  state.sessions = new Map(keep.map((s) => [s.sid, s]))
}

function trimBuckets() {
  if (state.hourBuckets.size > HOUR_KEEP * 24) {
    const keys = [...state.hourBuckets.keys()].sort()
    for (const k of keys.slice(0, keys.length - HOUR_KEEP * 24)) state.hourBuckets.delete(k)
  }
  if (state.dayBuckets.size > DAY_KEEP) {
    const keys = [...state.dayBuckets.keys()].sort()
    for (const k of keys.slice(0, keys.length - DAY_KEEP)) state.dayBuckets.delete(k)
  }
}

/* ────────────── 持久化 ────────────── */
function serialize() {
  return {
    v: 1,
    savedAt: Date.now(),
    visitors: [...state.visitors.values()],
    sessions: [...state.sessions.values()],
    hourBuckets: [...state.hourBuckets.entries()],
    dayBuckets: [...state.dayBuckets.entries()],
    chapterFunnel: [...state.chapterFunnel.entries()],
    endings: [...state.endings.entries()],
    langs: [...state.langs.entries()],
    devices: [...state.devices.entries()],
  }
}

export function saveNow() {
  if (saving) return
  saving = true
  try {
    trimBuckets()
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${STATE_FILE}.tmp`
    writeFileSync(tmp, JSON.stringify(serialize()), 'utf-8')
    renameSync(tmp, STATE_FILE)
    dirty = false
  } catch (e) {
    console.error('[store] 保存失败:', e.message)
  } finally {
    saving = false
  }
}

export function load() {
  if (!existsSync(STATE_FILE)) {
    console.log('[store] 无历史数据，从空状态启动')
    return
  }
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    for (const v of raw.visitors || []) state.visitors.set(v.vid, v)
    const now = Date.now()
    for (const s of raw.sessions || []) {
      // 丢弃超过 12 小时的残留会话，避免重启后产生超长「在线」时长
      if (now - s.last > 12 * 3600 * 1000) continue
      state.sessions.set(s.sid, s)
    }
    for (const [k, b] of raw.hourBuckets || []) state.hourBuckets.set(k, b)
    for (const [k, b] of raw.dayBuckets || []) state.dayBuckets.set(k, b)
    for (const [k, f] of raw.chapterFunnel || []) state.chapterFunnel.set(k, f)
    for (const [k, n] of raw.endings || []) state.endings.set(k, n)
    for (const [k, n] of raw.langs || []) state.langs.set(k, n)
    for (const [k, n] of raw.devices || []) state.devices.set(k, n)
    console.log(
      `[store] 已载入 ${state.visitors.size} 位访客 / ${state.sessions.size} 个会话`,
    )
  } catch (e) {
    console.error('[store] 载入失败，以空状态启动:', e.message)
  }
}

export function startAutoSave(intervalMs = 20000) {
  const t = setInterval(() => {
    if (dirty) saveNow()
  }, intervalMs)
  t.unref?.()
  return t
}

export function seedDemoData() {
  // 供本地自测：造一批演示数据，便于后台图表有内容可看
  const now = Date.now()
  const devs = ['手机', '手机', '手机', '电脑', '平板']
  const langs = ['zh', 'zh', 'en', 'ja', 'fr']
  for (let i = 0; i < 60; i += 1) {
    const vid = 'demo' + String(i).padStart(4, '0')
    const first = now - Math.floor(Math.random() * 25 * 86400000)
    const sess = 1 + Math.floor(Math.random() * 3)
    const totalSec = Math.floor(30 + Math.random() * 2400)
    const maxCh = Math.floor(1 + Math.random() * 8)
    const chapters = {}
    for (let c = 1; c <= maxCh; c += 1) chapters[String(c)] = 1
    state.visitors.set(vid, {
      vid,
      firstSeen: first,
      lastSeen: first + Math.floor(Math.random() * 86400000 * 3),
      sessions: sess,
      totalSec,
      lang: langs[i % langs.length],
      device: devs[i % devs.length],
      browser: 'Chrome',
      ua: 'demo',
      ref: '',
      screen: '390x844',
      chapters,
      maxChapter: maxCh,
      endings: maxCh >= 8 && Math.random() > 0.5 ? { hope: 1 } : {},
      days: { [dayKey(first)]: 1 },
      played: true,
    })
    for (let c = 1; c <= maxCh; c += 1) {
      let f = state.chapterFunnel.get(String(c))
      if (!f) {
        f = { vid: {}, n: 0 }
        state.chapterFunnel.set(String(c), f)
      }
      if (!f.vid[vid]) {
        f.vid[vid] = 1
        f.n += 1
      }
    }
    // 会话明细（让「单次时长」类统计有数据）
    const sessStart = first + Math.floor(Math.random() * 6 * 3600 * 1000)
    const sid = `${vid}-s1`
    state.sessions.set(sid, {
      sid,
      vid,
      start: sessStart,
      last: sessStart + totalSec * 1000,
      sec: totalSec,
      chapter: maxCh,
      lang: langs[i % langs.length],
      device: devs[i % devs.length],
      browser: 'Chrome',
      endings: Object.keys(state.visitors.get(vid).endings).length ? { hope: 1 } : {},
      played: true,
      day: dayKey(sessStart),
    })

    const dk = dayKey(first)
    const db = getBucket(state.dayBuckets, dk)
    db.v[vid] = 1
    db.newV += 1
    db.sessions += sess
    db.sec += totalSec
    const hb = getBucket(state.hourBuckets, hourKey(first))
    hb.v[vid] = 1
    hb.newV += 1
    hb.sessions += sess
    hb.sec += totalSec
    bumpCounter(state.devices, devs[i % devs.length])
    bumpCounter(state.langs, langs[i % langs.length])
    if (maxCh >= 8 && Math.random() > 0.5) {
      state.endings.set('hope', (state.endings.get('hope') || 0) + 1)
    }
    // 让少量访客处于「在线」状态，便于后台实时面板有内容
    if (i < 4) {
      touchLive(vid, `${vid}-s1`, {
        chapter: maxCh,
        lang: langs[i % langs.length],
        device: devs[i % devs.length],
      })
    }
  }
  dirty = true
  saveNow()
  console.log('[store] 已写入演示数据')
}

export const _state = state
