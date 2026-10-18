/**
 * 后台 API 客户端
 *
 * 线上：后台部署在 /Ayden-BHG/admin/，接口在 /Ayden-BHG/national/api/，用相对路径 ../national/api 访问
 * 开发：vite dev 与后端不同端口，直连 http://127.0.0.1:8787
 */
const RUNTIME_BASE =
  (typeof window !== 'undefined' && window.__GM_API_BASE__) || ''

export const API_BASE = import.meta.env.DEV
  ? 'http://127.0.0.1:8787/api'
  : RUNTIME_BASE || './api'

async function req(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (res.status === 401) {
    const err = new Error('unauthorized')
    err.code = 401
    throw err
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  // 注意：路径不含 /api，前缀统一由 API_BASE 提供，避免拼接重复
  me: () => req('/admin/me'),
  login: (user, pass) =>
    req('/admin/login', { method: 'POST', body: JSON.stringify({ user, pass }) }),
  logout: () => req('/admin/logout', { method: 'POST' }),
  overview: (days = 30) => req(`/admin/overview?days=${days}`),
  visitors: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return req(`/admin/visitors${q ? `?${q}` : ''}`)
  },
}

/* ────────────── 格式化工具 ────────────── */
export function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  if (s < 60) return `${s}秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分${s % 60 ? `${s % 60}秒` : ''}`
  const h = Math.floor(m / 60)
  return `${h}小时${m % 60 ? `${m % 60}分` : ''}`
}

export function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export function fmtAgo(ts, now = Date.now()) {
  const d = Math.max(0, Math.round((now - ts) / 1000))
  if (d < 60) return `${d}秒前`
  if (d < 3600) return `${Math.floor(d / 60)}分钟前`
  if (d < 86400) return `${Math.floor(d / 3600)}小时前`
  return `${Math.floor(d / 86400)}天前`
}

export const LANG_LABEL = { zh: '中文', en: 'English', ja: '日本語', fr: 'Français' }
export const ENDING_LABEL = {
  hope: '希望结局',
  memory: '记忆结局',
  silence: '沉默结局',
}
