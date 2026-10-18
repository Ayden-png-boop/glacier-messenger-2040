import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Timer, CheckCircle2, XCircle } from 'lucide-react'

/**
 * QTE 小游戏 —— 夜袭采矿站（方案 选项3①）。
 * 30 秒内关满 n 处矿井阀门即成功；超时即失败。
 * 结果由父组件接手：成功/失败对应不同数值惩罚与后果文案。
 */
export default function QteOverlay({ t, choice, onFinish }) {
  const { targets: total = 8, seconds = 30 } = choice?.qte || {}
  const [phase, setPhase] = useState('intro') // intro | play | done
  const [closed, setClosed] = useState(0)
  const [left, setLeft] = useState(seconds)
  const [target, setTarget] = useState(null)
  const [success, setSuccess] = useState(false)
  const areaRef = useRef(null)
  const finishedRef = useRef(false)

  const spawn = useCallback(
    (n) => {
      const x = 12 + Math.random() * 76
      const y = 14 + Math.random() * 70
      setTarget({ key: n, x, y, born: Date.now() })
    },
    [],
  )

  const finish = useCallback(
    (ok) => {
      if (finishedRef.current) return
      finishedRef.current = true
      setSuccess(ok)
      setPhase('done')
    },
    [],
  )

  // 主循环：倒计时 + 目标过期自动重置
  useEffect(() => {
    if (phase !== 'play') return undefined
    const started = Date.now()
    const iv = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      const remain = Math.max(0, seconds - elapsed)
      setLeft(remain)
      if (remain <= 0) finish(false)
    }, 100)
    spawn(0)
    return () => clearInterval(iv)
  }, [phase, seconds, finish, spawn])

  // 目标 3.5 秒未被点掉 → 换位置（不扣分，制造紧迫感）
  useEffect(() => {
    if (phase !== 'play' || !target) return undefined
    const iv = setInterval(() => {
      if (Date.now() - target.born > 3500) spawn(target.key + 1)
    }, 200)
    return () => clearInterval(iv)
  }, [phase, target, spawn])

  const hit = () => {
    if (phase !== 'play') return
    const n = closed + 1
    setClosed(n)
    if (n >= total) finish(true)
    else spawn(target.key + 1)
  }

  const areaStyle = useMemo(() => ({}), [])

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-md rounded-xl border border-cyan-400/40 bg-gradient-to-b from-slate-900 to-slate-800 p-5 shadow-2xl">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-cyan-300">
          <Crosshair className="h-5 w-5" />
          {t('qteTitle')}
        </h3>
        <p className="mb-4 text-sm text-gray-400">{t('qteBrief', { n: total })}</p>

        {phase === 'intro' && (
          <div className="animate-fade-in">
            <div className="mb-4 rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-gray-300 story-text">
              {t('qteHint')}
            </div>
            <button
              type="button"
              onClick={() => setPhase('play')}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 font-semibold text-white transition-all hover:from-cyan-500 hover:to-blue-500"
            >
              {t('qteGo')}
            </button>
          </div>
        )}

        {phase === 'play' && (
          <div className="animate-fade-in">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <Timer className="h-4 w-4" />
                {t('qteTime')} {left.toFixed(1)}s
              </span>
              <span className="text-gray-300">
                {t('qteProgress')} {closed}/{total}
              </span>
            </div>
            <div
              ref={areaRef}
              style={areaStyle}
              className="relative h-64 w-full touch-none overflow-hidden rounded-lg border border-cyan-400/20 bg-[radial-gradient(circle_at_50%_40%,#0e7490_0%,#020617_75%)]"
            >
              {/* 背景网格，强化「矿区」氛围 */}
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(34,211,238,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.25) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              />
              {target && (
                <button
                  type="button"
                  key={target.key}
                  onClick={hit}
                  aria-label="valve"
                  className="qte-target absolute grid h-14 w-14 place-items-center rounded-full border-2 border-amber-300 bg-amber-400/25 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,.55)] active:scale-95"
                  style={{ left: `${target.x}%`, top: `${target.y}%`, marginLeft: -28, marginTop: -28 }}
                >
                  <span className="text-xl">⚙</span>
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="animate-pop text-center">
            {success ? (
              <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-green-400" />
            ) : (
              <XCircle className="mx-auto mb-3 h-14 w-14 text-red-400" />
            )}
            <p className={`mb-4 text-lg font-semibold ${success ? 'text-green-300' : 'text-red-300'}`}>
              {success ? t('qteSuccess') : t('qteFail')}
            </p>
            <button
              type="button"
              onClick={() => onFinish(success)}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 font-semibold text-white transition-all hover:from-cyan-500 hover:to-blue-500"
            >
              {t('chooseScene')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
