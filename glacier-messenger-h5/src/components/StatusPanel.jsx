import { BarChart3, Handshake, Flame, HeartPulse } from 'lucide-react'

/**
 * 三环数值面板（对标参考站 StatusRing：30px SVG，r=13.5，stroke 3，-rotate-90）
 * compact=true → 顶栏右上角迷你版（22px 环、隐藏图标与文字标签，仅靠颜色区分）
 */
function StatusRing({ label, value, max = 100, icon: Icon, colorClass, compact = false }) {
  const size = compact ? 22 : 30
  const stroke = compact ? 2.5 : 3
  const r = (size - stroke) / 2
  const c = r * 2 * Math.PI
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const offset = c - (pct / 100) * c

  const ring = (
    <div className="relative">
      <svg width={size} height={size} className="-rotate-90 transform">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={colorClass}
          style={{ transition: 'stroke-dashoffset 0.3s ease-in-out' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className={compact ? 'text-[9px] font-semibold leading-none' : 'text-xs font-semibold'}>
          {Math.round(value)}
        </span>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-1" title={`${label} ${Math.round(value)}`}>
        <Icon className={`hidden h-3.5 w-3.5 sm:block ${colorClass}`} />
        {ring}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-5 w-5 ${colorClass}`} />
      <span className="text-sm font-medium">{label}</span>
      {ring}
    </div>
  )
}

export default function StatusPanel({ t, stats, compact = false }) {
  const items = [
    { label: t('cooperation'), value: stats.cooperation, icon: Handshake, colorClass: 'text-green-400' },
    { label: t('radical'), value: stats.radical, icon: Flame, colorClass: 'text-red-400' },
    { label: t('health'), value: stats.health, icon: HeartPulse, colorClass: 'text-pink-400' },
  ]

  if (compact) {
    return (
      <div
        aria-label={t('flockStatus')}
        className="flex w-max max-w-full shrink-0 items-center gap-1.5 rounded-lg border border-blue-500/25 bg-black/35 px-2 py-1 backdrop-blur-sm"
      >
        <span className="hidden shrink-0 whitespace-nowrap text-xs leading-none text-blue-300/75 sm:inline">
          {t('flockStatus')}
        </span>
        {items.map((it) => (
          <StatusRing key={it.label} {...it} compact />
        ))}
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-lg border border-blue-500/30 bg-black/30 p-4 backdrop-blur-sm">
      <h3 className="mb-3 flex items-center text-lg font-semibold">
        <BarChart3 className="mr-2 h-6 w-6 text-blue-400" />
        {t('flockStatus')}
      </h3>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-8">
        {items.map((it) => (
          <StatusRing key={it.label} {...it} />
        ))}
      </div>
    </div>
  )
}
