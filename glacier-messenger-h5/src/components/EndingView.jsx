import { useMemo } from 'react'
import { RotateCcw, Trophy } from 'lucide-react'
import PooledVideo from './PooledVideo.jsx'
import Narration from './Narration.jsx'
import { pick, pickVO } from '../i18n/ui.js'
import { voSegments, useVoiceOver } from '../hooks/useVoiceOver.js'

/**
 * 结局页（对标参考站 je()[Ut] 分支）：
 * 标题（紫色渐变卡）→ 正片视频 → 结局描述 → 最终数值 + 综合得分 → 重新开始
 */
export default function EndingView({ pool, t, lang, ending, endingKey, voOn, muted, onBlocked, stats, score, grade, onRestart }) {
  const data = ending
  const vo = useMemo(() => pickVO(lang), [lang])
  const segs = useMemo(() => voSegments(`ending:${endingKey}:desc`), [endingKey])
  const ids = useMemo(() => segs.map((s) => s.id), [segs])
  const { activeId, blocked, resume } = useVoiceOver({ ids, lang, enabled: !!voOn })
  return (
    <div
      className="mx-auto flex w-full max-w-[1920px] flex-col px-4 space-y-6"
      style={{ minHeight: 'var(--vh100, 100vh)' }}
    >
      <div className="w-full rounded-lg border border-purple-500/30 bg-gradient-to-r from-purple-900/40 to-blue-900/40 p-6 backdrop-blur-sm">
        <h2 className="mb-4 font-bold text-purple-400" style={{ fontSize: 40, lineHeight: 1.15 }}>
          {t('endingTag')} · {pick(data.title, lang)}
        </h2>
        <PooledVideo
          pool={pool}
          name={data.video}
          muted={muted}
          /* 结局页有旁白在念，画面音只作背景 */
          volume={activeId ? 0.22 : 0.6}
          onBlocked={onBlocked}
          shellClass="mb-4 w-full"
          lang={lang}
          eager
        />
        <Narration
          segs={segs}
          fallback={pick(data.description, lang)}
          activeId={activeId}
          lang={lang}
          t={t}
          blocked={blocked}
          onResume={resume}
          blockedLabel={vo.blocked}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-xl text-gray-300">{t('finalStats')}</h3>
        <div className="rounded-lg bg-black/30 p-4 backdrop-blur-sm">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">{stats.cooperation}</div>
              <div className="text-sm text-gray-400">{t('cooperationStat')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{stats.radical}</div>
              <div className="text-sm text-gray-400">{t('radicalStat')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-pink-400">{stats.health}</div>
              <div className="text-sm text-gray-400">{t('healthStat')}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-300">
              <Trophy className="h-5 w-5 text-amber-300" />
              {t('scoreGrade')} · {grade}
            </div>
            <div className="mt-1 bg-gradient-to-br from-cyan-400 via-blue-300 to-purple-400 bg-clip-text text-5xl font-extrabold text-transparent">
              {score.toFixed(2)}
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-300">{t('totalScore')}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="mx-auto flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-8 py-3 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-cyan-400/30"
        >
          <RotateCcw className="h-5 w-5" />
          {t('restart')}
        </button>
      </div>
    </div>
  )
}
