import { useEffect, useMemo, useRef, useState } from 'react'
import { posterUrl, posterUrlJpg } from '../hooks/useVideoPool'
import { makeT } from '../i18n/ui.js'
import { onUserGesture, userGestureSeen } from '../lib/autoplay.js'

/**
 * 视频默认音量。
 * 这些都是带环境音的素材片，满音量会盖过旁白配音，所以默认压到 0.7。
 */
const DEFAULT_VOLUME = 0.7

/**
 * 池化视频组件（全程自动播放，不出现「轻触播放」入口）：
 *  - 视频元素来自 useVideoPool 池（复用，不反复创建解码器）
 *  - 先渲染 WebP 封面占位，视频 canplay 后交叉淡入 → 无黑块、无布局跳动
 *  - 起播被内核拦时：先退静音保住画面，再挂到「下一次手势」上补播 / 补声音
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
  /* 挂载 effect 只依赖 name/pool，读 muted 必须走 ref，否则拿到的是首次渲染的旧值 */
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const [ready, setReady] = useState(false)

  /* 挂载：取池元素 → 附着到 DOM → 起播 */
  useEffect(() => {
    const host = hostRef.current
    if (!host || !name) return undefined
    const el = pool.ensure(name)
    pool.markActive?.(name, true) // 预取要为正在播放的它让路

    // 起播前先落定音量属性：池里建出来的元素一律是 muted=true，
    // 若等属性同步 effect 再改，就会「先静音播一小段、再出声」。
    el.muted = mutedRef.current
    if (typeof volume === 'number') el.volume = Math.max(0, Math.min(1, volume))

    // 切换片名时必须先回到「未就绪」：否则会沿用上一支片的 ready=true，
    // 新片还没数据就撤掉封面和转圈 —— 看到的就是一片黑。
    setReady(false)

    let settled = false
    let stuckTimer = null
    let retried = false
    let retryTimer = null
    let retryCount = 0
    let disposed = false

    const stopRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    /* 起播被拒后的重试：内核拒绝是一次性的判定，等一会儿（或等一次点击）常常就好了。
       次数封顶，避免低电量模式里无限空转。 */
    const scheduleRetry = (delay) => {
      if (disposed || retryTimer || retryCount >= 8) return
      retryCount += 1
      retryTimer = setTimeout(
        () => {
          retryTimer = null
          attempt()
        },
        delay ?? (retryCount <= 2 ? 800 : 2500),
      )
    }

    /* 现在到底该不该播：被摘下 DOM / 上层为浮层主动暂停 / 已经在播，都不该抢播 */
    const canPlayNow = () => {
      if (disposed || !autoPlay || !el.isConnected) return false
      if (!el.paused) return false
      if (pool.pausedByApp?.(name)) return false
      return true
    }

    /* 静音兜底：画面必须先动起来，声音交给下一次手势补 */
    const playMuted = () => {
      if (disposed) return
      el.muted = true
      blockedRef.current?.()
      try {
        const p = el.play()
        if (p && typeof p.catch === 'function') p.catch(() => scheduleRetry())
      } catch {
        scheduleRetry()
      }
    }

    /* 起播：有手势解锁过才试带声，被拒立刻退静音 —— 任何情况下都不停在封面上等玩家点 */
    const attempt = () => {
      if (!canPlayNow()) return
      const wantSound = !mutedRef.current && userGestureSeen()
      el.muted = !wantSound
      try {
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch((e) => {
            if (disposed) return
            // AbortError：切 src / 换章打断，属正常现象，不当作失败
            if (e && e.name === 'AbortError') return
            if (!el.muted) {
              playMuted()
              return
            }
            scheduleRetry()
          })
        }
      } catch {
        scheduleRetry()
      }
    }

    /* 正在静音播、但玩家其实开着声音 → 在手势里补一次「有声起播」。
       iOS 只放行同一个调用栈里的 play()，所以这个函数只能在手势回调里调。 */
    const applySound = () => {
      if (disposed || !el.isConnected) return
      if (mutedRef.current || !el.muted) return
      if (pool.pausedByApp?.(name)) return
      el.muted = false
      try {
        const p = el.play()
        if (p && typeof p.catch === 'function') p.catch(() => playMuted())
      } catch {
        playMuted()
      }
    }

    /* 任意一次真实手势（点选项、开声音、滑动…）→ 同步补播。
       这样「轻触播放」按钮可以彻底不要：玩家本来就要点选项才能继续。 */
    const offGesture = onUserGesture(() => {
      retryCount = 0
      stopRetry()
      applySound()
      attempt()
    })

    const markReady = () => {
      if (settled) return
      settled = true
      if (stuckTimer) clearTimeout(stuckTimer)
      // 视频元素由池管理、手动挂载，不在 React 的 class 控制范围内，
      // 必须显式打上 .ready —— 否则 .video-shell video{opacity:0} 会一直生效（黑块）。
      el.classList.add('ready')
      setReady(true)
      readyRef.current?.(el)
      attempt()
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

    /* 播着播着被内核暂停（切后台回来、iOS 低电量模式、策略收紧）→ 自动补播，
       不再弹「轻触播放」。上层为浮层主动暂停的、自然播完的，都不算。 */
    const handlePause = () => {
      if (unmountingRef.current || disposed) return
      if (!el.isConnected) return
      if (pool.pausedByApp?.(name)) return
      if (!loop && el.ended) return
      scheduleRetry(600)
    }
    el.addEventListener('pause', handlePause)
    const handlePlaying = () => {
      retryCount = 0
      stopRetry()
    }
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
    attempt()

    return () => {
      disposed = true
      unmountingRef.current = true
      offGesture()
      stopRetry()
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
    // （React 离散事件是同步 flush 的），会被放行；万一仍被拒，attempt 里已静音回落。
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
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      )}
      {/* 兜底热区：内核彻底拒绝时（iOS 低电量模式）点画面任意处都是一次真实手势。
          不显示任何文案，正常播放时它不存在，所以永远不会出现「轻触播放」提示。 */}
      <button
        type="button"
        aria-label={t('tapToPlay')}
        tabIndex={-1}
        onClick={() => {
          const el = pool.peek?.(name)
          if (!el) return
          el.muted = mutedRef.current
          try {
            const p = el.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          } catch {
            /* noop */
          }
        }}
        className="absolute inset-0 cursor-default bg-transparent"
      />
    </div>
  )
}
