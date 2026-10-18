/**
 * 游戏端访问统计：游客同样计入
 *
 * - vid 存 localStorage（长期标识同一浏览器，用于「累计玩过多少人 / 人均时长」）
 * - sid 存 sessionStorage（每个标签页一次会话，用于「单次时长 / 当前在线」）
 * - 页面隐藏（切后台）期间不计入时长：visibilitychange 时重置计时基准
 * - 后端不可达时全部静默失败，不影响游戏本体
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const DEV = import.meta.env.DEV
const API = DEV ? 'http://127.0.0.1:8787/api' : './api'
const BEAT_MS = 10000 // 心跳间隔
const LIVE_MS = 20000 // 播报刷新间隔

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function getVid() {
  try {
    let v = localStorage.getItem('gm_vid')
    if (!v) {
      v = uuid()
      localStorage.setItem('gm_vid', v)
    }
    return v
  } catch {
    return `tmp-${Math.random().toString(36).slice(2)}`
  }
}

function getSid() {
  try {
    let s = sessionStorage.getItem('gm_sid')
    if (!s) {
      s = uuid()
      sessionStorage.setItem('gm_sid', s)
    }
    return s
  } catch {
    return `tmp-${Math.random().toString(36).slice(2)}`
  }
}

async function post(path, payload) {
  try {
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!r.ok) return null
    return await r.json().catch(() => null)
  } catch {
    return null // 后端不可达：静默降级
  }
}

export function useStats({ lang, chapterId, endingKey, enabled = true }) {
  const [live, setLive] = useState(null)
  const vidRef = useRef(null)
  const sidRef = useRef(null)
  const readyRef = useRef(null) // hello 的 Promise：事件必须等访客登记完成再发
  const lastRef = useRef(Date.now())
  const metaRef = useRef({ lang, chapterId, endingKey })

  useEffect(() => {
    metaRef.current = { lang, chapterId, endingKey }
  }, [lang, chapterId, endingKey])

  /* 登记 + 心跳 + 播报轮询 */
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const vid = getVid()
    const sid = getSid()
    vidRef.current = vid
    sidRef.current = sid
    lastRef.current = Date.now()

    let alive = true

    readyRef.current = post('/hello', {
      vid,
      sid,
      lang,
      ref: document.referrer || '',
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    })

    const poll = async () => {
      try {
        const r = await fetch(`${API}/stats/live`, { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (alive && j && j.ok) setLive(j)
      } catch {
        /* 静默 */
      }
    }
    // 首次播报必须等 hello 落地，否则读到的还是登记前的 0
    if (readyRef.current) readyRef.current.finally(poll)
    else poll()

    const tLive = setInterval(poll, LIVE_MS)
    const tBeat = setInterval(() => {
      const now = Date.now()
      // 页面不可见时不累计时长
      const dSec = document.hidden ? 0 : (now - lastRef.current) / 1000
      lastRef.current = now
      post('/beat', {
        vid,
        sid,
        dSec: Math.round(dSec * 10) / 10,
        chapter: metaRef.current.chapterId,
        lang: metaRef.current.lang,
      })
    }, BEAT_MS)

    const onVis = () => {
      lastRef.current = Date.now()
    }
    document.addEventListener('visibilitychange', onVis)

    /* 离开页面时补发剩余时长：否则停留不足一个心跳周期的访客时长恒为 0 */
    const flush = () => {
      if (!vidRef.current) return
      const now = Date.now()
      const dSec = Math.max(0, Math.min(120, (now - lastRef.current) / 1000))
      lastRef.current = now
      const payload = JSON.stringify({
        vid: vidRef.current,
        sid: sidRef.current,
        dSec: Math.round(dSec * 10) / 10,
        chapter: metaRef.current.chapterId,
        lang: metaRef.current.lang,
      })
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${API}/beat`, new Blob([payload], { type: 'application/json' }))
        } else {
          fetch(`${API}/beat`, {
            method: 'POST',
            body: payload,
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      } catch {
        /* 静默 */
      }
    }
    window.addEventListener('pagehide', flush)

    return () => {
      alive = false
      clearInterval(tLive)
      clearInterval(tBeat)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', flush)
    }
    // 只在挂载时建立一次；lang/chapter 通过 metaRef 传递，避免心跳被反复重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const event = useCallback((type, data) => {
    if (!vidRef.current) return
    const send = () =>
      post('/event', { vid: vidRef.current, sid: sidRef.current, type, data })
    // 必须等 hello 落地：服务端要先有访客档案，否则章节/结局事件会被当成未知访客丢弃
    if (readyRef.current) readyRef.current.finally(send)
    else send()
  }, [])

  /* 章节进度 / 结局 / 语言 */
  useEffect(() => {
    if (chapterId) event('chapter', { id: chapterId })
  }, [chapterId, event])

  useEffect(() => {
    if (endingKey) event('ending', { key: endingKey })
  }, [endingKey, event])

  useEffect(() => {
    event('lang', { lang })
  }, [lang, event])

  return { live, event }
}
