/**
 * 冰川信使 2040 — 统计后端（零依赖，仅用 Node 内置模块）
 *
 * 监听 127.0.0.1:8787，由 nginx 反代 /Ayden-BHG/national/api/ 与 /Ayden-BHG/admin/
 * 启动：node server.js [--port 8787] [--seed]
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import * as store from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = join(__dirname, 'config.json')
const ADMIN_SESSION_FILE = join(__dirname, 'data', 'admin-sessions.json')
// 后台静态目录：服务器上与后端同级的 dist-admin；本地开发时在游戏工程下的 dist-admin
const STATIC_DIR = (() => {
  const local = join(__dirname, 'dist-admin')
  if (existsSync(local)) return local
  return join(__dirname, '..', 'glacier-messenger-h5', 'dist-admin')
})()

const PORT = Number(process.env.PORT || pickArg('--port', '8787'))
const HOST = process.env.HOST || '127.0.0.1'
const SESSION_TTL = 12 * 3600 * 1000
const MAX_BODY = 64 * 1024

/* ────────────── 配置：密码自动转哈希 ────────────── */
function loadConfig() {
  let cfg = { adminUser: '管理员', passHash: '', salt: '' }
  if (existsSync(CONFIG_FILE)) {
    try {
      cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
    } catch (e) {
      console.error('[config] 解析失败，使用默认:', e.message)
    }
  }
  // 若配置里仍是明文密码，自动升级为加盐哈希并回写，避免明文长期留在磁盘
  if (cfg.adminPass) {
    cfg.salt = randomBytes(16).toString('hex')
    cfg.passHash = hashPass(cfg.adminPass, cfg.salt)
    delete cfg.adminPass
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
    console.log('[config] 明文密码已转为加盐哈希')
  }
  return cfg
}

function hashPass(pass, salt) {
  return createHash('sha256').update(`${salt}:${pass}`).digest('hex')
}

function verifyPass(pass, cfg) {
  if (!cfg.passHash || !cfg.salt) return false
  const a = Buffer.from(hashPass(pass, cfg.salt), 'utf-8')
  const b = Buffer.from(cfg.passHash, 'utf-8')
  return a.length === b.length && timingSafeEqual(a, b)
}

const CONFIG = loadConfig()

/* ────────────── 管理员会话 ────────────── */
const adminSessions = new Map() // token -> { user, exp, ip }
function loadAdminSessions() {
  if (!existsSync(ADMIN_SESSION_FILE)) return
  try {
    for (const [t, s] of JSON.parse(readFileSync(ADMIN_SESSION_FILE, 'utf-8'))) {
      if (s.exp > Date.now()) adminSessions.set(t, s)
    }
  } catch (e) {
    /* 忽略损坏文件 */
  }
}
function saveAdminSessions() {
  try {
    mkdirSync(dirname(ADMIN_SESSION_FILE), { recursive: true })
    const arr = [...adminSessions.entries()].filter(([, s]) => s.exp > Date.now())
    writeFileSync(ADMIN_SESSION_FILE, JSON.stringify(arr), 'utf-8')
  } catch (e) {
    /* 忽略 */
  }
}
loadAdminSessions()

/* ────────────── 登录限流 ────────────── */
const failLog = new Map() // ip -> { n, until }
function loginBlocked(ip) {
  const r = failLog.get(ip)
  if (!r) return 0
  if (r.until > Date.now()) return Math.ceil((r.until - Date.now()) / 1000)
  if (r.until && r.until <= Date.now()) failLog.delete(ip)
  return 0
}
function noteFail(ip) {
  const r = failLog.get(ip) || { n: 0, until: 0 }
  r.n += 1
  if (r.n >= 6) r.until = Date.now() + 5 * 60 * 1000
  failLog.set(ip, r)
}

/* ────────────── HTTP 工具 ────────────── */
function json(res, code, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf-8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch (e) {
        reject(new Error('bad-json'))
      }
    })
    req.on('error', reject)
  })
}

function parseCookies(str) {
  const out = {}
  for (const part of String(str || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (xf) return String(xf).split(',')[0].trim()
  return req.socket.remoteAddress || ''
}

function isAuthed(req) {
  const c = parseCookies(req.headers.cookie)
  const t = c.gm_admin
  if (!t) return false
  const s = adminSessions.get(t)
  if (!s || s.exp < Date.now()) return false
  s.exp = Date.now() + SESSION_TTL // 滑动续期
  return true
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function serveStatic(req, res, pathname) {
  let rel = pathname.replace(/^\/+/, '')
  if (!rel || rel.endsWith('/')) rel += 'index.html'
  const full = join(STATIC_DIR, normalize(rel))
  if (!full.startsWith(STATIC_DIR) || !existsSync(full) || !statSync(full).isFile()) {
    // SPA 回退
    const idx = join(STATIC_DIR, 'index.html')
    if (existsSync(idx)) {
      const b = readFileSync(idx)
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': b.length })
      return res.end(b)
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('404')
  }
  const ext = extname(full).toLowerCase()
  const buf = readFileSync(full)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
  })
  res.end(buf)
}

/* ────────────── 路由 ────────────── */
const routes = {
  'POST /api/hello': async (req, res, { body }) => {
    const vid = String(body.vid || '').slice(0, 64)
    const sid = String(body.sid || '').slice(0, 64)
    if (!vid || !sid) return json(res, 400, { ok: false, error: 'missing-vid-or-sid' })
    const r = store.hello({
      vid,
      sid,
      lang: body.lang,
      ua: req.headers['user-agent'],
      ref: body.ref,
      screen: body.screen,
    })
    json(res, 200, { ok: true, isNew: r.isNew })
  },

  'POST /api/beat': async (req, res, { body }) => {
    const r = store.beat({
      vid: body.vid,
      sid: body.sid,
      dSec: body.dSec,
      chapter: body.chapter,
      lang: body.lang,
    })
    json(res, r.ok ? 200 : 200, r)
  },

  'POST /api/event': async (req, res, { body }) => {
    const r = store.trackEvent({
      vid: body.vid,
      sid: body.sid,
      type: body.type,
      data: body.data,
    })
    json(res, 200, r)
  },

  'GET /api/stats/live': async (req, res) => {
    json(res, 200, { ok: true, ...store.liveStats() })
  },

  'POST /api/admin/login': async (req, res, { body }) => {
    const ip = clientIp(req)
    const wait = loginBlocked(ip)
    if (wait > 0) return json(res, 429, { ok: false, error: 'too-many-tries', wait })
    const user = String(body.user || '').trim()
    const pass = String(body.pass || '')
    if (user === CONFIG.adminUser && verifyPass(pass, CONFIG)) {
      failLog.delete(ip)
      const token = randomBytes(32).toString('hex')
      adminSessions.set(token, { user, exp: Date.now() + SESSION_TTL, ip })
      saveAdminSessions()
      json(res, 200, { ok: true, user }, {
        'Set-Cookie': `gm_admin=${token}; Path=/; Max-Age=${SESSION_TTL / 1000}; HttpOnly; SameSite=Lax`,
      })
    } else {
      noteFail(ip)
      json(res, 401, { ok: false, error: 'bad-credentials' })
    }
  },

  'POST /api/admin/logout': async (req, res) => {
    const c = parseCookies(req.headers.cookie)
    if (c.gm_admin) adminSessions.delete(c.gm_admin)
    saveAdminSessions()
    json(res, 200, { ok: true }, {
      'Set-Cookie': 'gm_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    })
  },

  'GET /api/admin/me': async (req, res) => {
    const ok = isAuthed(req)
    json(res, ok ? 200 : 401, { ok, user: ok ? CONFIG.adminUser : null })
  },

  'GET /api/admin/overview': async (req, res, { query }) => {
    if (!isAuthed(req)) return json(res, 401, { ok: false, error: 'unauthorized' })
    json(res, 200, { ok: true, ...store.overview({ days: query.days }) })
  },

  'GET /api/admin/visitors': async (req, res, { query }) => {
    if (!isAuthed(req)) return json(res, 401, { ok: false, error: 'unauthorized' })
    json(res, 200, { ok: true, ...store.visitorPage(query) })
  },

  'GET /api/health': async (req, res) => {
    json(res, 200, { ok: true, uptime: process.uptime(), ...store.liveStats() })
  },
}

/* ────────────── 服务器 ────────────── */
const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = u.pathname

  // CORS（本地开发时前端 5273 直连 8787）
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname)
  }

  const key = `${req.method} ${pathname}`
  const handler = routes[key]
  if (!handler) {
    return json(res, 404, { ok: false, error: 'not-found', path: pathname })
  }

  try {
    const body = req.method === 'POST' ? await readBody(req) : {}
    const query = Object.fromEntries(u.searchParams.entries())
    await handler(req, res, { body, query })
  } catch (e) {
    if (e.message === 'body-too-large' || e.message === 'bad-json') {
      return json(res, 400, { ok: false, error: e.message })
    }
    console.error('[req]', key, e.message)
    json(res, 500, { ok: false, error: 'internal' })
  }
})

/* ────────────── 启动 ────────────── */
function pickArg(name, dflt) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

store.load()
if (process.argv.includes('--seed')) store.seedDemoData()
store.startAutoSave(20000)
setInterval(() => store.sweep(), 15000).unref?.()
setInterval(saveAdminSessions, 5 * 60 * 1000).unref?.()

server.listen(PORT, HOST, () => {
  console.log(`[server] 统计后端已启动 http://${HOST}:${PORT}`)
  console.log(`[server] 管理员账号: ${CONFIG.adminUser}`)
  console.log(`[server] 静态目录: ${STATIC_DIR}${existsSync(STATIC_DIR) ? '' : ' (尚未构建)'}`)
})

const shutdown = () => {
  console.log('[server] 正在保存数据并退出…')
  store.saveNow()
  saveAdminSessions()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
