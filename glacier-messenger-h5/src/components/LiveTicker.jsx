/**
 * 在线播报条：当前多少人在玩 / 累计多少人玩过（游客一并计入）
 * 后端不可达时 live 为 null，整条隐藏，不影响游戏本体
 */
export default function LiveTicker({ live, t }) {
  if (!live) return null
  return (
    <div className="mx-auto flex w-fit max-w-full items-center gap-2.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-100 backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="tabular">{t('livePlaying', { n: live.online ?? 0 })}</span>
      </span>
      <span className="text-emerald-300/40">·</span>
      <span className="tabular text-emerald-200/80">
        {t('livePlayed', { n: live.totalPlayed ?? 0 })}
      </span>
    </div>
  )
}
