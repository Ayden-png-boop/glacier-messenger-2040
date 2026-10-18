/**
 * 视频资源管理 —— 性能核心。
 *
 * 策略（对应评估报告的四层优化）：
 *  1. 素材层：全部片段已在构建期做 faststart（moov 前置）→ 浏览器可用 Range 渐进起播；
 *  2. 加载层：首屏门控（正片彻底下完前零预取）+ 按章按需预取（本章后果片 + 下一章正片），
 *     预取走串行队列，任何时刻只有一个请求在跑；
 *  3. 播放层：元素池化复用（避免反复 createElement + 解码器抖动）；
 *  4. 释放层：离开预取窗口的元素立刻 pause + 摘除 src + load() 释放解码缓冲，防内存膨胀。
 *
 * 慢网（SaveData / 2G）时收缩 maxLive 并提示省流模式。
 */
import { useCallback, useMemo, useRef, useState } from 'react'

const BASE = import.meta.env.BASE_URL || './'
export const videoUrl = (name) => `${BASE}videos/${name}.mp4`
export const posterUrl = (name) => `${BASE}posters/${name}.webp`
/** 老浏览器兜底：Safari 14 以下不认 WebP。
 *  <picture> 不支持时（几乎不存在）会直接走 <img> 的 jpg，两头都安全。 */
export const posterUrlJpg = (name) => `${BASE}posters/${name}.jpg`

function detectSlowNet() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!c) return false
    if (c.saveData) return true
    const t = (c.effectiveType || '').toLowerCase()
    return t.includes('2g') || t === 'slow-2g'
  } catch {
    return false
  }
}

/**
 * 元素健康度：加载失败（error）或源已被摘除（NETWORK_NO_SOURCE）的元素不能再复用。
 * 这种元素永远不会再触发 canplay —— 复用它表现为「一直转圈、播不出来」。
 */
function healthy(el) {
  if (!el) return false
  if (el.error) return false
  // 判坏只看「src 还在不在」——src 被摘掉是 prune 释放过的唯一可靠特征。
  // 千万别用 networkState 判断：刚 createElement 完、还没插进 DOM 的元素
  // 状态并不稳定（实测会被判成 NO_SOURCE），误判的后果是
  //   ① 预取刚下完就被当作废品丢掉；
  //   ② 播放时 ensure 重建出一个新元素，而它永远不会被 appendChild → 画面全黑。
  if (!el.getAttribute('src')) return false
  return true
}

/**
 * 预取元素的隐藏宿主。
 * 早先预取用的是 `display:none` 且完全不插入 DOM —— 这在 Chrome 上能下，
 * 但 **iOS Safari 不会为不在 DOM 里的 video 取数**，等于整套预取在 iOS 上失效
 * （切章时现下载，转圈很久）。改成挂到一个 1×1、不可见、不挡点击的容器里。
 */
let prefetchHostEl = null
function prefetchHost() {
  if (typeof document === 'undefined') return null
  if (prefetchHostEl && prefetchHostEl.isConnected) return prefetchHostEl
  prefetchHostEl = document.getElementById('gm-prefetch')
  if (!prefetchHostEl) {
    prefetchHostEl = document.createElement('div')
    prefetchHostEl.id = 'gm-prefetch'
    prefetchHostEl.setAttribute('aria-hidden', 'true')
    prefetchHostEl.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1'
    document.body.appendChild(prefetchHostEl)
  }
  return prefetchHostEl
}

const inPrefetchHost = (el) => {
  const h = prefetchHostEl
  return !!(h && el && el.parentNode === h)
}

/** 统一的视频元素工厂：预取与播放必须走同一份配置，
 *  否则「预取能下、播放不能播」——属性不一致会让两条路径行为分叉。 */
function createVideoEl(name, { hidden = false } = {}) {
  const el = document.createElement('video')
  el.src = videoUrl(name)
  el.preload = 'auto'
  el.playsInline = true
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', '')
  el.setAttribute('x5-playsinline', '')
  // 微信 Android（X5 内核）默认会把视频抢成全屏播放器，这两条让它保持内联
  el.setAttribute('x5-video-player-type', 'h5-page')
  el.setAttribute('x5-video-player-fullscreen', 'false')
  el.setAttribute('x-webkit-airplay', 'allow')
  el.loop = true
  el.muted = true
  // 注意：不要设 crossOrigin。素材与页面同源，设了反而让请求进入 CORS 模式，
  // 一旦服务端没回 ACAO 头（或中途有 301/CDN），视频就会静默失败。
  if (hidden) {
    el.style.width = '1px'
    el.style.height = '1px'
  }
  return el
}

/** 等待某个媒体元素进入可播状态（readyState≥3 或 loadeddata），带超时兜底 */
function waitReady(el, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!el) return resolve(false)
    if (!healthy(el)) return resolve(false)
    if (el.readyState >= 3) return resolve(true)
    let done = false
    const ok = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      el.removeEventListener('loadeddata', ok)
      el.removeEventListener('canplay', ok)
      el.removeEventListener('error', ok)
      // 关键：error / 超时时必须返回 false。
      // 早先这里写的是 `resolve(el.readyState >= 2 || done)` —— done 此时恒为 true，
      // 于是失败的元素也被当成「已就绪」留在池里，后续复用就永远播不出来。
      resolve(healthy(el) && el.readyState >= 2)
    }
    const timer = setTimeout(ok, timeoutMs)
    el.addEventListener('loadeddata', ok)
    el.addEventListener('canplay', ok)
    el.addEventListener('error', ok)
  })
}

/**
 * 等待视频「基本缓冲完毕」（readyState≥4 或已缓冲到 95%）。
 * 与 waitReady 的区别：waitReady 在刚能起播时就放行（faststart 视频只要几百 KB），
 * whenBuffered 要等正片真正下完才放行 —— 用它做预取门控，才能保证首屏带宽不被抢占。
 */
function waitBuffered(el, timeoutMs = 25000) {
  return new Promise((resolve) => {
    if (!el) return resolve(false)
    const enough = () => {
      if (el.readyState >= 4) return true
      try {
        const b = el.buffered
        if (b.length && el.duration && b.end(b.length - 1) >= el.duration * 0.95) return true
      } catch {
        /* noop */
      }
      return false
    }
    let settled = false
    let timer = null // 必须先声明：早退路径下 done() 会在赋定时器之前被调用
    const done = () => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      el.removeEventListener('progress', onProg)
      el.removeEventListener('canplaythrough', done)
      el.removeEventListener('error', done)
      el.removeEventListener('ended', done)
      resolve(enough())
    }
    const onProg = () => {
      if (enough()) done()
    }
    if (enough()) return done()
    timer = setTimeout(done, timeoutMs)
    el.addEventListener('progress', onProg)
    el.addEventListener('canplaythrough', done)
    el.addEventListener('error', done)
    el.addEventListener('ended', done)
  })
}

/**
 * 等待视频「真正下完」：缓冲区间覆盖到片尾（或浏览器触发 suspend 停止取数）。
 * readyState≥4 只代表「够播」，Chrome 此时往往还在后台续传 —— 用它做门控会让
 * 预取提前插队、把正片挤到卡顿。所以预取门控必须用这个更严格的条件。
 */
function waitFullyLoaded(el, timeoutMs = 25000) {
  return new Promise((resolve) => {
    if (!el) return resolve(false)
    const full = () => {
      try {
        const b = el.buffered
        if (el.duration && b.length && b.end(b.length - 1) >= el.duration - 0.3) return true
      } catch {
        /* noop */
      }
      return false
    }
    let settled = false
    let timer = null // 同 waitBuffered：早退路径下 done() 会先于定时器赋值执行
    const done = () => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      el.removeEventListener('progress', onProg)
      el.removeEventListener('suspend', done)
      el.removeEventListener('error', done)
      resolve(true)
    }
    const onProg = () => {
      if (full()) done()
    }
    if (full()) return done()
    timer = setTimeout(done, timeoutMs)
    el.addEventListener('progress', onProg)
    el.addEventListener('suspend', done)
    el.addEventListener('error', done)
  })
}

export function useVideoPool({ maxLive = 4 } = {}) {
  const poolRef = useRef(null)
  if (!poolRef.current) poolRef.current = new Map() // name -> {el, usedAt, warmed}

  const queueRef = useRef([]) // 串行预取队列：一次只下一个，避免并发抢带宽
  const pumpingRef = useRef(false)
  const activeRef = useRef(null) // 当前正在播放的视频名（预取必须给它让路）
  const urgentRef = useRef(false) // 玩家已点选项、马上要播的片：插队 + 不等让路
  /* 「上层主动暂停」的片：浮层盖住页面时正片会被 pause，这是有意为之。
     PooledVideo 的自动补播必须避开它们，否则浮层底下会自己响起来。 */
  const pausedByAppRef = useRef(null)
  if (!pausedByAppRef.current) pausedByAppRef.current = new Set()

  // 首屏门控：默认关闭，App 在章节正片彻底下完后调用 releaseGate() 打开。
  // 这样首屏带宽 100% 归正片，起播时间不受任何预取干扰。
  const gateRef = useRef(null)
  if (!gateRef.current) {
    gateRef.current = { promise: null, resolve: null, open: false }
    gateRef.current.promise = new Promise((r) => {
      gateRef.current.resolve = r
    })
  }

  const [netSlow] = useState(detectSlowNet)
  const capRef = useRef(maxLive)
  capRef.current = netSlow ? Math.min(2, maxLive) : maxLive

  /** 取出（或创建）某个视频元素；标记为「当前」并提升优先级 */
  const ensure = useCallback((name) => {
    const pool = poolRef.current
    let slot = pool.get(name)
    // 池里已有但已损坏的元素必须换掉：预取中途断网 / 被 prune 摘过 src 都会留下这种
    // 「永远等不到 canplay」的死元素，直接复用就是播不出来。
    if (slot && !healthy(slot.el)) {
      try {
        slot.el.pause()
        slot.el.removeAttribute('src')
        slot.el.load()
        // 预取元素现在挂在隐藏宿主里，释放时必须一并摘掉，否则 DOM 里堆满空壳
        if (slot.el.parentNode) slot.el.parentNode.removeChild(slot.el)
      } catch {
        /* noop */
      }
      pool.delete(name)
      slot = null
    }
    if (!slot) {
      const el = createVideoEl(name)
      slot = { el, usedAt: Date.now(), warmed: false }
      pool.set(name, slot)
    }
    slot.usedAt = Date.now()
    slot.warmed = false
    // 预取元素建的时候被压成 1×1 + display:none（省显存、不进布局），
    // 复用播放时必须把这些**内联样式全部还原**。只还原 display 是不够的：
    // 内联 width/height 的优先级高于 .video-shell video{width:100%;height:100%}，
    // 元素会保持 1×1 —— 封面此时已被 .ready 隐藏，壳子只剩背景色，表现为整块黑屏
    // （首章直建的元素没有内联尺寸，所以「第一章正常、后面时好时坏」）。
    slot.el.style.display = ''
    slot.el.style.width = ''
    slot.el.style.height = ''
    return slot.el
  }, [])

  /**
   * 串行预取：入队后由一个 worker 逐个下载（前一个 readyState≥3 才启动下一个）。
   * 这是首屏不被预取流量拖慢的关键 —— 任何时刻只有一个预取请求在跑。
   */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    try {
      // 首屏门控：正片没下完之前，一个预取都不放行
      /* eslint-disable-next-line no-await-in-loop */
      await gateRef.current.promise
      while (queueRef.current.length) {
        const n = queueRef.current.shift()
        const pool = poolRef.current
        if (!n) continue
        if (pool.has(n)) {
          // 池里已有：健康的跳过，损坏的丢掉重建（否则这支片以后再也取不到）
          if (healthy(pool.get(n).el)) continue
          pool.delete(n)
        }

        // 让路：正在播放的视频没缓冲完，就暂停预取（否则会把它挤到卡顿）。
        // 例外：urgent —— 玩家已经点了选项，浮层马上要播这支片，不能再等。
        if (!urgentRef.current) {
          const active = activeRef.current && pool.get(activeRef.current)
          if (active && healthy(active.el)) {
            /* eslint-disable-next-line no-await-in-loop */
            await waitFullyLoaded(active.el, 25000)
          }
        }
        const el = createVideoEl(n, { hidden: true })
        // 必须挂进 DOM：iOS Safari 不为游离的 video 取数，否则预取形同虚设
        prefetchHost()?.appendChild(el)
        pool.set(n, { el, usedAt: Date.now(), warmed: true })
        /* eslint-disable-next-line no-await-in-loop */
        const ok = await waitReady(el, 15000)
        if (!ok && !healthy(el)) {
          // 预取失败（断网/超时）：绝不能把坏元素留在池里，
          // 否则 ensure 会拿到它，表现就是「点了选项，浮层里的片子转圈但播不出来」。
          try {
            el.pause()
            el.removeAttribute('src')
            el.load()
          } catch {
            /* noop */
          }
          pool.delete(n)
        }
        pruneInternal(pool, capRef.current)
      }
    } finally {
      pumpingRef.current = false
      urgentRef.current = false
    }
  }, [])

  const enqueue = useCallback(
    (names) => {
      if (!names?.length) return
      const set = new Set([...queueRef.current, ...poolRef.current.keys()])
      for (const n of names) if (n && !set.has(n)) queueRef.current.push(n)
      pump()
    },
    [pump],
  )

  /**
   * 紧急预取：玩家已经点了选项，浮层紧接着就要播这支片。
   * 与 enqueue 的区别：插到队首 + 放开首屏门控 + 跳过「给正片让路」的等待，
   * 因为此时浮层已盖满屏幕，正片不再需要独占带宽。
   */
  const prefer = useCallback(
    (names) => {
      if (!names?.length) return
      const pool = poolRef.current
      const need = [...new Set(names.filter((n) => n && !healthy(pool.get(n)?.el)))]
      if (!need.length) return
      urgentRef.current = true
      queueRef.current = [...need, ...queueRef.current.filter((n) => !need.includes(n))]
      if (!gateRef.current.open) {
        gateRef.current.open = true
        gateRef.current.resolve()
      }
      pump()
    },
    [pump],
  )

  /**
   * 只取不建：给「同步属性」这类场景用。
   * 这类 effect 若走 ensure，一旦触发重建，新元素不会被 appendChild（那段逻辑在挂载 effect 里），
   * 结果就是池里躺着一个能播的元素、页面上挂着一个被掏空的旧元素。
   */
  const peek = useCallback((name) => poolRef.current.get(name)?.el || null, [])

  /** 强制重载某支片：卡在「等不到 canplay」时的自救（会重新走一遍网络流程） */
  const reload = useCallback((name) => {
    const slot = poolRef.current.get(name)
    if (!slot) return false
    const el = slot.el
    try {
      const t = el.currentTime || 0
      const playing = !el.paused
      el.load()
      el.currentTime = t
      if (playing) {
        const p = el.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }
      return true
    } catch {
      return false
    }
  }, [])

  /** 暂停某支片（浮层盖住页面时，别让它继续解码抢性能） */
  const pause = useCallback((name) => {
    const slot = poolRef.current.get(name)
    if (!slot) return false
    try {
      pausedByAppRef.current.add(name)
      slot.el.pause()
      return true
    } catch {
      return false
    }
  }, [])

  /** 是不是「上层主动暂停」的：自动补播据此让路 */
  const isPausedByApp = useCallback((name) => pausedByAppRef.current.has(name), [])

  /**
   * 把静音状态同步到「正在页面上播放」的元素，并让它们继续播。
   * 必须在真实用户手势里调用：静音状态下起播的视频，解除静音时浏览器会重新判定
   * 自动播放策略，只有手势内的 play() 才会放行。
   * 只处理 isConnected 的元素 —— 预取元素没挂到 DOM 上，不能顺手给它们起播。
   */
  const applyMuted = useCallback((on) => {
    let touched = 0
    for (const [, slot] of poolRef.current) {
      const el = slot.el
      if (!el || !el.isConnected) continue
      // 还在预取宿主里的元素只是「下载中」，别顺手给它起播
      if (inPrefetchHost(el)) continue
      try {
        el.muted = !!on
        touched += 1
        // 解除静音时必须显式 play()：Chrome 在 unmute 那一刻会重新判定自动播放策略，
        // 命中即直接暂停。这里处在手势里，play() 会被放行；
        // 而且先同步改了 el.muted，PooledVideo 的属性 effect 就不会再补一次 play。
        if (!on && el.readyState >= 2) {
          const p = el.play()
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              // 仍被拦：退回静音继续播，画面不能停
              el.muted = true
              el.play().catch(() => {})
            })
          }
        }
      } catch {
        /* noop */
      }
    }
    return touched
  }, [])

  /** 恢复某支片 */
  const resume = useCallback((name) => {
    const slot = poolRef.current.get(name)
    if (!slot || !healthy(slot.el)) return false
    // 已经不在页面上的元素不要起播：否则会在浮层/结局页背后传出「幽灵音」
    if (!slot.el.isConnected) return false
    try {
      pausedByAppRef.current.delete(name)
      const p = slot.el.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
      return true
    } catch {
      return false
    }
  }, [])

  /** 等待「正在播放的」某个视频进入可播状态（readyState≥3） */
  const whenPlayable = useCallback((name, timeoutMs = 25000) => {
    const slot = poolRef.current.get(name)
    if (!slot) return Promise.resolve(false)
    return waitReady(slot.el, timeoutMs)
  }, [])

  /** 标记当前正在播放的视频（预取会为它让路） */
  const markActive = useCallback((name, on = true) => {
    if (on) {
      activeRef.current = name
      // 新挂载的元素一定是要播的：清掉上一轮遗留的「上层暂停」标记
      pausedByAppRef.current.delete(name)
    } else if (activeRef.current === name) activeRef.current = null
  }, [])

  /** 打开首屏门控：章节正片已彻底下完，此后放行预取 */
  const releaseGate = useCallback(() => {
    if (gateRef.current.open) return
    gateRef.current.open = true
    gateRef.current.resolve()
    pump()
  }, [pump])

  /** 等待「正在播放的」某个视频真正下完 —— 预取门控用它，保证正片独享首屏带宽 */
  const whenBuffered = useCallback((name, timeoutMs = 25000) => {
    const slot = poolRef.current.get(name)
    if (!slot) return Promise.resolve(false)
    return waitFullyLoaded(slot.el, timeoutMs)
  }, [])

  /** 释放策略：保留 keep 集合 + 最近使用的 maxLive 个，其余立即释放 */
  const prune = useCallback((keep = []) => {
    const pool = poolRef.current
    const keepSet = new Set(keep)
    const lru = [...pool.entries()]
      .filter(([n]) => !keepSet.has(n))
      .sort((a, b) => b[1].usedAt - a[1].usedAt)
      .slice(0, capRef.current)
      .map(([n]) => n)
    const allow = new Set([...keep, ...lru])
    for (const [n, slot] of [...pool.entries()]) {
      if (allow.has(n)) continue
      try {
        slot.el.pause()
        slot.el.removeAttribute('src')
        slot.el.load()
        // 预取元素现在挂在隐藏宿主里，释放时必须一并摘掉，否则 DOM 里堆满空壳
        if (slot.el.parentNode) slot.el.parentNode.removeChild(slot.el)
      } catch {
        /* noop */
      }
      // 被释放的若是「当前播放片」，必须清掉引用：
      // 否则预取的让路逻辑会在一个 src 已被摘除的元素上干等 25 秒，预取全线停滞。
      if (activeRef.current === n) activeRef.current = null
      pausedByAppRef.current.delete(n)
      pool.delete(n)
    }
  }, [])

  const releaseAll = useCallback(() => {
    const pool = poolRef.current
    for (const [, slot] of pool) {
      try {
        slot.el.pause()
        slot.el.removeAttribute('src')
        slot.el.load()
        // 预取元素现在挂在隐藏宿主里，释放时必须一并摘掉，否则 DOM 里堆满空壳
        if (slot.el.parentNode) slot.el.parentNode.removeChild(slot.el)
      } catch {
        /* noop */
      }
    }
    activeRef.current = null
    pausedByAppRef.current.clear()
    pool.clear()
  }, [])

  const currentNames = useCallback(() => [...poolRef.current.keys()], [])

  return useMemo(
    () => ({
      ensure,
      enqueue,
      prefer,
      reload,
      peek,
      pause,
      resume,
      markActive,
      whenPlayable,
      whenBuffered,
      releaseGate,
      prune,
      releaseAll,
      applyMuted,
      isPausedByApp,
      netSlow,
      cap: capRef.current,
      currentNames,
    }),
    [
      ensure,
      enqueue,
      prefer,
      reload,
      peek,
      pause,
      resume,
      markActive,
      isPausedByApp,
      whenPlayable,
      whenBuffered,
      releaseGate,
      prune,
      releaseAll,
      applyMuted,
      netSlow,
      currentNames,
    ],
  )
}

function pruneInternal(pool, cap) {
  const lru = [...pool.entries()]
    .filter(([, s]) => s.warmed)
    .sort((a, b) => b[1].usedAt - a[1].usedAt)
    .slice(cap)
    .map(([n]) => n)
  for (const n of lru) {
    const slot = pool.get(n)
    try {
      slot.el.pause()
      slot.el.removeAttribute('src')
      slot.el.load()
      if (slot.el.parentNode) slot.el.parentNode.removeChild(slot.el)
    } catch {
      /* noop */
    }
    pool.delete(n)
  }
}
