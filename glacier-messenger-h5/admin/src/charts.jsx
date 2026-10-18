/**
 * 纯 SVG 图表（不引入图表库，避免包体膨胀）
 * 统一浅色主题，viewBox 固定宽度，配合 w-full 自适应容器
 */
const W = 720

function niceMax(v) {
  if (v <= 5) return 5
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / (mag / 2)) * (mag / 2)
}

/* ────────────── 折线图（支持多系列 + 面积填充） ────────────── */
export function LineChart({ data = [], xKey = 'label', series = [], height = 220 }) {
  const H = height
  const padL = 42
  const padR = 12
  const padT = 14
  const padB = 26
  const iw = W - padL - padR
  const ih = H - padT - padB

  const max = niceMax(
    Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))),
  )
  const n = data.length
  const xAt = (i) => padL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1))
  const yAt = (v) => padT + ih - (Math.min(v, max) / max) * ih

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(max * p))
  const labelStep = Math.max(1, Math.ceil(n / 8))

  // x 轴标签：均匀取样 + 强制包含末点；若末点与前一个采样点太近，去掉前一个，避免叠字
  const labelIdx = []
  for (let i = 0; i < n; i += labelStep) labelIdx.push(i)
  if (n > 1 && labelIdx[labelIdx.length - 1] !== n - 1) labelIdx.push(n - 1)
  if (labelIdx.length > 1) {
    const a = labelIdx[labelIdx.length - 2]
    const b = labelIdx[labelIdx.length - 1]
    if (b - a < labelStep * 0.7) labelIdx.splice(labelIdx.length - 2, 1)
  }
  const labelSet = new Set(labelIdx)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        {series.map((s, si) => (
          <linearGradient key={s.key} id={`lg-${s.key}-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>

      {/* 网格 + y 轴刻度 */}
      {ticks.map((t, i) => {
        const y = yAt(t)
        return (
          <g key={i}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray={i === 0 ? '' : '3 4'}
            />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {t}
            </text>
          </g>
        )
      })}

      {/* 系列 */}
      {series.map((s, si) => {
        const pts = data.map((d, i) => [xAt(i), yAt(Number(d[s.key]) || 0)])
        const line = pts.map((p) => p.join(',')).join(' ')
        const area = `${padL},${padT + ih} ${line} ${W - padR},${padT + ih}`
        return (
          <g key={s.key}>
            {series.length === 1 && (
              <polygon points={area} fill={`url(#lg-${s.key}-${si})`} />
            )}
            <polyline
              points={line}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {n <= 40 &&
              pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#fff" stroke={s.color} strokeWidth="1.6" />
              ))}
          </g>
        )
      })}

      {/* x 轴标签 */}
      {data.map((d, i) =>
        labelSet.has(i) ? (
          <text
            key={i}
            x={xAt(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="#94a3b8"
          >
            {d[xKey]}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/* ────────────── 纵向柱状图 ────────────── */
export function BarChart({ data = [], height = 200, color = '#6366f1' }) {
  const H = height
  const padL = 36
  const padR = 12
  const padT = 16
  const padB = 28
  const iw = W - padL - padR
  const ih = H - padT - padB
  const max = niceMax(Math.max(1, ...data.map((d) => Number(d.count) || 0)))
  const n = Math.max(1, data.length)
  const bw = Math.min(72, (iw / n) * 0.62)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {[0, 0.5, 1].map((p) => {
        const y = padT + ih - p * ih
        return (
          <g key={p}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeDasharray={p === 0 ? '' : '3 4'} />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {Math.round(max * p)}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const cx = padL + (iw / n) * (i + 0.5)
        const v = Number(d.count) || 0
        const bh = (Math.min(v, max) / max) * ih
        return (
          <g key={d.label}>
            <rect
              x={cx - bw / 2}
              y={padT + ih - bh}
              width={bw}
              height={Math.max(1, bh)}
              rx="4"
              fill={d.color || color}
            />
            <text x={cx} y={padT + ih - bh - 5} textAnchor="middle" fontSize="10" fill="#475569">
              {v}
            </text>
            <text x={cx} y={H - 9} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ────────────── 横向条形图（占比类） ────────────── */
export function HBar({ data = [], labelMap = {}, unit = '' }) {
  const total = data.reduce((a, d) => a + (Number(d.count) || 0), 0)
  const max = Math.max(1, ...data.map((d) => Number(d.count) || 0))
  const colors = ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']
  return (
    <div className="space-y-2.5">
      {data.length === 0 && <p className="text-sm text-slate-400">暂无数据</p>}
      {data.map((d, i) => {
        const v = Number(d.count) || 0
        const pct = total ? Math.round((v / total) * 100) : 0
        return (
          <div key={d.key} className="flex items-center gap-3">
            <span className="w-20 shrink-0 truncate text-sm text-slate-600">
              {labelMap[d.key] || d.key || '未知'}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className="h-full rounded-md transition-all duration-500"
                style={{
                  width: `${Math.max(2, (v / max) * 100)}%`,
                  background: colors[i % colors.length],
                }}
              />
            </div>
            <span className="tabular w-16 shrink-0 text-right text-sm text-slate-500">
              {v}
              {unit}
            </span>
            <span className="tabular w-10 shrink-0 text-right text-xs text-slate-400">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

/* ────────────── 章节漏斗 ────────────── */
export function Funnel({ data = [] }) {
  const max = Math.max(1, ...data.map((d) => Number(d.count) || 0))
  const first = data.length ? Number(data[0].count) || 0 : 0
  return (
    <div className="space-y-2">
      {data.length === 0 && <p className="text-sm text-slate-400">暂无数据</p>}
      {data.map((d, i) => {
        const v = Number(d.count) || 0
        const rate = first ? Math.round((v / first) * 100) : 0
        return (
          <div key={d.id} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-sm text-slate-600">第{d.id}章</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-cyan-400 to-indigo-500 pr-2 transition-all duration-500"
                style={{ width: `${Math.max(3, (v / max) * 100)}%` }}
              >
                {v > 0 && (
                  <span className="tabular text-[11px] font-medium text-white">{v}人</span>
                )}
              </div>
            </div>
            <span className="tabular w-12 shrink-0 text-right text-xs text-slate-400">
              {i === 0 ? '100%' : `${rate}%`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
