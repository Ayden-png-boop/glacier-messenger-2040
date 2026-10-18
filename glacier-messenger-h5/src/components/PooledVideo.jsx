import { useEffect, useMemo, useRef, useState } from 'react'
import { posterUrl, posterUrlJpg } from '../hooks/useVideoPool'
import { makeT } from '../i18n/ui.js'

/**
 * 视频默认音量。
 * 这些都是带环境音的素材片，满音量会盖过旁白配音，所以默认压到 0.7。
 */
const DEFAULT_VOLUME = 0.7

/**
 * 池化视频组件：
 *  - 视频元素来自 useVideoPool 池（复用，不反复创建解码器）
 *  - 先渲染 WebP 封面占位，视频 canplay 后交叉淡入 → 无黑块、无布局跳动
 *  - 卸载时只 pause 并移出 DOM，元素本身保留在池中待复用
 *  - muted/loop 变化走独立的属性同步 effect，不触发重挂载
 */
export default function PooledVideo({
  pool,
  name,
  muted = true,
  volume = DEFAULT_VOLUME,
  autoPlay = true,
  loop = true,
  shellClass = '',
  eager = false,
  lang = 'zh',
  onEnded,
  onCompleted,
  onReady,
  onBlocked,
}) {
  const t = useMemo(() => makeT(lang), [lang])
  const hostRef = useRef(null)
  /* 自动播放彻底失败时的兜底：iOS 低电量模式、部分 App 内置浏览器会连静音播放都拒。
     此时不能让页面停在转圈（或黑屏），给一个「轻触播放」按钮让玩家自己点一下。 */
  const [needsGesture, setNeedsGesture] = useState(false)
  const unmountingRef = useRef(false)
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  /* 「完整播过一遍」：loop 模式下 ended 永不触发，只能靠 timeupdate 逼近片尾判定。
     只上报一次，上层用它判断「影像已经看完了」。 */
  const completedRef = useRef(onCompleted)
  completedRef.current = onCompleted
  const blockedRef = useRef(onBlocked)
  blockedRef.current = onBlocked
  const [ready, setReady] = useState(false)

  /* 挂载：取池元素 → 附着到 DOM → 起播 */
  useEffect(() => {
    const host = hostRef.current
    if (!host || !name) return undefined
    const el = pool.ensure(name)
    pool.markActive?.(name, true) // 预取要为正在播放的它让路

    // 起播前先落定音量属性：池里建出来的元素一律是 muted=true，
    // 若等属性同步 effect 再改，就会「先静音播一小段、再出声」。
    el.muted = muted
    if (typeof volume === 'number') el.volume = Math.max(0, Math.min(1, volume))

    // 切换片名时必须先回到「未就绪」：否则会沿用上一支片的 ready=true，
    // 新片还没数据就撤掉封面和转圈 —— 看到的就是一片黑。
    setReady(false)
    setNeedsGesture(false)

    let settled = false
    let stuckTimer = null
    let retried = false

    const tryPlay = () => {
      if (!autoPlay) return
      try {
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch((e) => {
            // 浏览器拦截了「无手势的有声自动播放」。此时绝不能让画面停住：
            // 退回落静音继续播，并通知上层把开关改回静音，UI 与实际保持一致。
            if (!el.muted && e && e.name === 'NotAllowedError') {
              el.muted = true
              const p2 = el.play()
              // 静音都播不了（iOS 低电量模式 / 严格内核）→ 交给玩家手动点一下
              if (p2 && typeof p2.catch === 'function') p2.catch(() => setNeedsGesture(true))
              blockedRef.current?.()
              return
            }
            // 非 NotAllowedError（AbortError 多因 src 切换，可忽略）之外一律给手动入口
            if (e && e.name !== 'AbortError') setNeedsGesture(true)
          })
        }
      } catch {
        setNeedsGesture(true)
      }
    }

    const markReady = () => {
      if (settled) return
      settled = true
      if (stuckTimer) clearTimeout(stuckTimer)
      // 视频元素由池管理、手动挂载，不在 React 的 class 控制范围内，
      // 必须显式打上 .ready —— 否则 .video-shell video{opacity:0} 会一直生效（黑块）。
      el.classList.add('ready')
      setReady(true)
      readyRef.current?.(el)
      tryPlay()
    }

    /* 卡死自检：迟迟等不到 canplay，多为预取阶段留下的坏元素（已 error 或 src 被摘）。
       这种元素不会再触发任何事件，只能强制重载自救。 */
    const onError = () => {
      if (retried || settled) return
      retried = true
      pool.reload?.(name)
    }
    const armStuck = () => {
      if (stuckTimer) clearTimeout(stuckTimer)
      stuckTimer = setTimeout(() => {
        if (settled) return
        pool.reload?.(name)
        // 再给一段耐心；仍不行就放弃等待，让上层兜底计时推进剧情，不把流程卡死
        stuckTimer = setTimeout(() => {
          if (!settled && el.readyState >= 2) markReady()
        }, 8000)
      }, 8000)
    }

    if (el.readyState >= 3) markReady()
    else {
      el.addEventListener('canplay', markReady, { once: true })
      el.addEventListener('error', onError)
      armStuck()
    }

    const handleEnded = () => endedRef.current?.()
    el.addEventListener('ended', handleEnded)

    /* 播着播着被浏览器暂停（切后台回来、内核策略收紧）→ 同样给出手动入口。
       卸载时的 pause 不算，用 unmountingRef 排除，否则换章会闪一下按钮。 */
    const handlePause = () => {
      if (unmountingRef.current) return
      if (el.readyState >= 2) setNeedsGesture(true)
    }
    el.addEventListener('pause', handlePause)
    const handlePlaying = () => setNeedsGesture(false)
    el.addEventListener('playing', handlePlaying)

    let playedOnce = false
    const markCompleted = () => {
      if (playedOnce) return
      playedOnce = true
      completedRef.current?.()
    }
    const handleTime = () => {
      const d = el.duration
      if (!d || !Number.isFinite(d)) return
      if (el.currentTime >= d - 0.3) markCompleted()
    }
    if (loop) el.addEventListener('timeupdate', handleTime)
    else el.addEventListener('ended', markCompleted)

    host.appendChild(el)
    /* 兜底：预取时元素被压过 1×1（内联样式），一旦有哪条路径漏了还原，
       画面会「在播但整块黑」。进 DOM 后统一清一次内联尺寸，交给 CSS 撑满。 */
    if (el.style.width || el.style.height) {
      el.style.width = ''
      el.style.height = ''
    }
    tryPlay()

    return () => {
      unmountingRef.current = true
      if (stuckTimer) clearTimeout(stuckTimer)
      el.removeEventListener('canplay', markReady)
      el.removeEventListener('error', onError)
      el.removeEventListener('ended', handleEnded)
      el.removeEventListener('ended', markCompleted)
      el.removeEventListener('timeupdate', handleTime)
      el.removeEventListener('pause', handlePause)
      el.removeEventListener('playing', handlePlaying)
      el.pause()
      pool.markActive?.(name, false)
      if (el.parentNode === host) host.removeChild(el)
      unmountingRef.current = false
    }
  }, [name, pool, autoPlay])

  /* 属性同步：muted / loop / 重播（不重新挂载）
     这里必须 peek 而不是 ensure —— ensure 可能触发重建，
     而重建出来的新元素不会走上面的 appendChild，等于把片子从页面上摘走。 */
  useEffect(() => {
    if (!name) return
    const el = pool.peek?.(name) || pool.ensure(name)
    if (!el) return
    const wasMuted = el.muted
    el.muted = muted
    el.loop = loop
    if (typeof volume === 'number') el.volume = Math.max(0, Math.min(1, volume))
    // 解除静音后补一次 play()：静音状态下起播的视频，部分浏览器在 unmute 时会直接暂停
    // （Chrome 的自动播放策略在 unmute 那一刻会重新判定）。这次 play() 紧随用户手势
    // （React 离散事件是同步 flush 的），会被放行；万一仍被拒，tryPlay 里已静音回落。
    if (wasMuted && !muted && autoPlay) {
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
  }, [name, muted, loop, volume, autoPlay, pool])

  return (
    <div className={`video-shell ${shellClass}`}>
      {/* WebP 优先，老内核（Safari <14）自动回落同名 jpg */}
      <picture>
        <source srcSet={posterUrl(name)} type="image/webp" />
        <img
          src={posterUrlJpg(name)}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={ready ? 'ready' : ''}
        />
      </picture>
      <div ref={hostRef} className="contents" />
      {!ready && !needsGesture && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      )}
      {/* 自动播放被内核彻底拒绝时的手动入口（点击 = 真实用户手势，必定放行） */}
      {needsGesture && (
        <button
          type="button"
          data-tap-to-play
          onClick={() => {
            const el = pool.peek?.(name)
            if (!el) return
            try {
              const p = el.play()
              if (p && typeof p.catch === 'function') p.catch(() => {})
              else setNeedsGesture(false)
            } catch {
              /* 保留按钮，玩家可以再点 */
            }
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm font-medium text-cyan-200"
        >
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>{t('tapToPlay')}</span>
        </button>
      )}
    </div>
  )
}
