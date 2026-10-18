import { useState, useEffect, useCallback } from 'react'
import { api, fmtDur, fmtTime, fmtAgo, LANG_LABEL, ENDING_LABEL } from './api.js'
import { LineChart, BarChart, HBar, Funnel } from './charts.jsx'

/* ────────────────────────── 登录 ────────────────────────── */
function Login({ onOk }) {
  const [user, setUser] = useState('管理员')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const r = await api.login(user.trim(), pass)
      if (r.ok) onOk(r.user)
      else setErr('账号或密码不正确')
    } catch (e2) {
      if (e2.code === 429) setErr('尝试次数过多，请稍后再试')
      else setErr(e2.code === 401 ? '账号或密码不正确' : '无法连接服务器，请检查网络')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-cyan-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 text-xl shadow-lg">
            🧊
          </div>
          <h1 className="text-lg font-semibold text-slate-800">冰川信使 2040</h1>
          <p className="mt-1 text-sm text-slate-500">数据管理后台</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">管理员账号</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">密码</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="请输入密码"
            />
          </div>

          {err && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>
          )}

          <button
            type="submit"
            disabled={busy || !pass}
            className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '正在登录…' : '登 录'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          游客数据同样计入统计 · 数据仅用于产品分析
        </p>
      </div>
    </div>
  )
}

/* ────────────────────────── 小组件 ────────────────────────── */
function Kpi({ label, value, sub, accent = 'indigo' }) {
  const accents = {
    indigo: 'from-indigo-500 to-indigo-400',
    cyan: 'from-cyan-500 to-cyan-400',
    amber: 'from-amber-500 to-amber-400',
    emerald: 'from-emerald-500 to-emerald-400',
    rose: 'from-rose-500 to-rose-400',
    violet: 'from-violet-500 to-violet-400',
  }
  return (
    <div className="card p-4">
      <div className={`mb-2 h-1 w-8 rounded-full bg-gradient-to-r ${accents[accent]}`} />
      <div className="text-xs text-slate-500">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

function Card({ title, extra, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  )
}

/* ────────────────────────── 看板 ────────────────────────── */
function Dashboard({ user, onLogout }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [updatedAt, setUpdatedAt] = useState(0)
  const [trendMode, setTrendMode] = useState('visitors')
  const [vis, setVis] = useState(null)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('lastSeen')
  const [tick, setTick] = useState(0) // 概览刷新后带动明细表一起刷新

  const load = useCallback(
    async (silent = false) => {
      try {
        const r = await api.overview(days)
        setData(r)
        setUpdatedAt(Date.now())
        setErr('')
        setTick((x) => x + 1)
      } catch (e) {
        if (e.code === 401) return onLogout()
        if (!silent) setErr('数据加载失败：' + e.message)
      }
    },
    [days, onLogout],
  )

  useEffect(() => {
    setData(null)
    load()
    const t = setInterval(() => load(true), 15000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    let alive = true
    api
      .visitors({ page, size: 15, sort })
      .then((r) => alive && setVis(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [page, sort, tick])

  const t = data?.totals || {}

  const trendSeries =
    trendMode === 'visitors'
      ? [{ key: 'visitors', label: '访客数', color: '#6366f1' }]
      : trendMode === 'new'
        ? [{ key: 'newVisitors', label: '新访客', color: '#06b6d4' }]
        : [{ key: 'minutes', label: '游玩分钟', color: '#f59e0b' }]

  return (
    <div className="min-h-full">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="text-lg">🧊</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-slate-800">
              冰川信使 2040 · 数据后台
            </h1>
            <p className="text-xs text-slate-400">
              {updatedAt ? `更新于 ${fmtAgo(updatedAt)} · 每 15 秒自动刷新` : '加载中…'}
            </p>
          </div>
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 sm:inline">
            {user}
          </span>
          <button
            onClick={() => load()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
          >
            刷新
          </button>
          <button
            onClick={async () => {
              await api.logout().catch(() => {})
              onLogout()
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
          >
            退出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-4">
        {err && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</div>
        )}

        {!data ? (
          <div className="card p-10 text-center text-sm text-slate-400">正在加载数据…</div>
        ) : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi
                label="累计访客（含游客）"
                value={t.visitors ?? 0}
                sub={`今日 ${t.todayVisitors ?? 0} 人`}
                accent="indigo"
              />
              <Kpi
                label="玩过游戏的人数"
                value={t.played ?? 0}
                sub={`游玩率 ${Math.round((t.playRate || 0) * 100)}%`}
                accent="cyan"
              />
              <Kpi
                label="此刻在线"
                value={t.online ?? 0}
                sub={`其中 ${t.onlinePlaying ?? 0} 人正在玩`}
                accent="emerald"
              />
              <Kpi
                label="累计游玩时长"
                value={t.totalSec >= 3600 ? `${t.totalHours} 小时` : fmtDur(t.totalSec)}
                sub={`人均 ${fmtDur(t.avgSec)}`}
                accent="amber"
              />
              <Kpi label="人均使用时长" value={fmtDur(t.avgSec)} sub="全部访客平均" accent="violet" />
              <Kpi
                label="时长中位数"
                value={fmtDur(t.medianSec)}
                sub={`P90 ${fmtDur(t.p90Sec)}`}
                accent="violet"
              />
              <Kpi
                label="单次平均时长"
                value={fmtDur(t.avgSessionSec)}
                sub={`中位 ${fmtDur(t.medianSessionSec)}`}
                accent="cyan"
              />
              <Kpi
                label="回访率"
                value={`${Math.round((t.returnRate || 0) * 100)}%`}
                sub="来过 2 次及以上"
                accent="rose"
              />
            </div>

            {/* 日趋势 */}
            <Card
              title="访问趋势"
              extra={
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { k: 'visitors', l: '访客数' },
                    { k: 'new', l: '新访客' },
                    { k: 'minutes', l: '时长' },
                  ].map((m) => (
                    <button
                      key={m.k}
                      onClick={() => setTrendMode(m.k)}
                      className={`rounded-md px-2.5 py-1 text-xs transition ${
                        trendMode === m.k
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m.l}
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-slate-200" />
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`rounded-md px-2.5 py-1 text-xs transition ${
                        days === d
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {d}天
                    </button>
                  ))}
                </div>
              }
            >
              <LineChart
                data={data.daySeries.map((d) => ({ ...d, label: d.day.slice(5) }))}
                series={trendSeries}
                height={230}
              />
            </Card>

            {/* 24 小时 + 时长分布 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="近 24 小时活跃（按小时）">
                <LineChart
                  data={data.hourSeries}
                  xKey="label"
                  series={[{ key: 'visitors', label: '访客数', color: '#06b6d4' }]}
                  height={200}
                />
              </Card>
              <Card title="用户使用时长分布">
                <BarChart data={data.durationDist} height={200} />
              </Card>
            </div>

            {/* 漏斗 + 分布 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="章节到达漏斗（去重人数）">
                <Funnel data={data.funnel} />
              </Card>
              <div className="space-y-4">
                <Card title="语言偏好">
                  <HBar data={data.langs} labelMap={LANG_LABEL} unit=" 次" />
                </Card>
                <Card title="设备类型">
                  <HBar data={data.devices} unit=" 次" />
                </Card>
                {data.endings?.length > 0 && (
                  <Card title="结局分布">
                    <HBar data={data.endings} labelMap={ENDING_LABEL} unit=" 次" />
                  </Card>
                )}
              </div>
            </div>

            {/* 实时在线 */}
            <Card
              title="实时在线"
              extra={
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {data.onlineList.length} 人在线
                </span>
              }
            >
              {data.onlineList.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  当前无人在线（45 秒内有活动即计入）
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="py-2 pr-3 font-medium">访客</th>
                        <th className="py-2 pr-3 font-medium">本次已停留</th>
                        <th className="py-2 pr-3 font-medium">当前章节</th>
                        <th className="py-2 pr-3 font-medium">语言</th>
                        <th className="py-2 pr-3 font-medium">设备</th>
                        <th className="py-2 font-medium">累计时长</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.onlineList.map((o) => (
                        <tr key={o.vid} className="border-b border-slate-50">
                          <td className="py-2 pr-3 font-mono text-xs text-slate-500">{o.vid}</td>
                          <td className="tabular py-2 pr-3">{fmtDur(o.sec)}</td>
                          <td className="py-2 pr-3">{o.chapter ? `第${o.chapter}章` : '未开始'}</td>
                          <td className="py-2 pr-3">{LANG_LABEL[o.lang] || o.lang || '—'}</td>
                          <td className="py-2 pr-3">{o.device || '—'}</td>
                          <td className="tabular py-2">{fmtDur(o.totalSec)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* 访客明细 */}
            <Card
              title="访客明细（含游客）"
              extra={
                <div className="flex items-center gap-1.5">
                  {[
                    { k: 'lastSeen', l: '最近' },
                    { k: 'totalSec', l: '时长' },
                    { k: 'sessions', l: '次数' },
                    { k: 'maxChapter', l: '进度' },
                  ].map((s) => (
                    <button
                      key={s.k}
                      onClick={() => {
                        setSort(s.k)
                        setPage(1)
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs transition ${
                        sort === s.k
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {s.l}
                    </button>
                  ))}
                </div>
              }
            >
              {!vis ? (
                <p className="py-4 text-center text-sm text-slate-400">加载中…</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="py-2 pr-3 font-medium">访客</th>
                          <th className="py-2 pr-3 font-medium">首次</th>
                          <th className="py-2 pr-3 font-medium">最近</th>
                          <th className="py-2 pr-3 font-medium">次数</th>
                          <th className="py-2 pr-3 font-medium">累计时长</th>
                          <th className="py-2 pr-3 font-medium">进度</th>
                          <th className="py-2 pr-3 font-medium">语言</th>
                          <th className="py-2 font-medium">设备</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vis.items.map((v) => (
                          <tr key={v.vid} className="border-b border-slate-50 hover:bg-slate-50/60">
                            <td className="py-2 pr-3 font-mono text-xs text-slate-500">
                              {v.online && (
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                              )}
                              {v.vid}
                            </td>
                            <td className="py-2 pr-3 text-xs text-slate-500">{fmtTime(v.firstSeen)}</td>
                            <td className="py-2 pr-3 text-xs text-slate-500">{fmtAgo(v.lastSeen)}</td>
                            <td className="tabular py-2 pr-3">{v.sessions}</td>
                            <td className="tabular py-2 pr-3 font-medium text-slate-700">
                              {fmtDur(v.totalSec)}
                            </td>
                            <td className="py-2 pr-3 text-xs">
                              {v.maxChapter ? `第${v.maxChapter}章` : '未开始'}
                              {v.endings.length > 0 && (
                                <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                  通关
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-xs">{LANG_LABEL[v.lang] || v.lang || '—'}</td>
                            <td className="py-2 text-xs">{v.device}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>共 {vis.total} 位访客</span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded-md border border-slate-300 px-2.5 py-1 transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        上一页
                      </button>
                      <span className="tabular">
                        {vis.page} / {Math.max(1, Math.ceil(vis.total / vis.size))}
                      </span>
                      <button
                        disabled={page * vis.size >= vis.total}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </>
              )}
            </Card>

            <p className="pb-6 text-center text-xs text-slate-400">
              统计口径：游客按浏览器本地标识去重计入；页面隐藏或切到后台时不计入时长；45
              秒内有心跳视为在线。
            </p>
          </>
        )}
      </main>
    </div>
  )
}

/* ────────────────────────── 根组件 ────────────────────────── */
export default function App() {
  const [auth, setAuth] = useState(null) // null=检查中 false=未登录 string=用户名

  useEffect(() => {
    api
      .me()
      .then((r) => setAuth(r.ok ? r.user || '管理员' : false))
      .catch(() => setAuth(false))
  }, [])

  if (auth === null) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-400">
        正在检查登录状态…
      </div>
    )
  }
  if (auth === false) return <Login onOk={() => setAuth('管理员')} />
  return <Dashboard user={auth} onLogout={() => setAuth(false)} />
}
