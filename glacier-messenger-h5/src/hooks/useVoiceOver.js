/**
 * 剧情配音播放器：按 VO 编号顺序播放旁白，并对外暴露「当前播到哪一条」用于字幕高亮。
 *
 * 要点：
 *  - 音频放在 public/voice/{lang}/，不进 bundle；路径必须用 import.meta.env.BASE_URL 拼，
 *    否则部署到子路径（/Ayden-BHG/national/）下会 404。
 *  - visual（画面提示）类型没有音频文件，播放时跳过，但字幕仍显示。
 *  - 浏览器可能拒绝自动播放 → play() reject 时置 blocked，由 UI 提示用户点一下开启。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import VO from '../story/vo-runtime.json'

const BASE = import.meta.env.BASE_URL || '/'
export const voSrc = (lang, id) => `${BASE}voice/${lang}/${id}.mp3`

/** 取某个位置（如 chapter:1:desc）对应的 VO 条目列表 */
export function voSegments(key) {
  const ids = VO.map?.[key]
  if (!ids?.length) return []
  return ids
    .map((id) => (VO.byId[id] ? { id, ...VO.byId[id] } : null))
    .filter(Boolean)
}

/** 该条是否有配音音频（画面提示不配音） */
export const hasAudio = (seg) => seg && seg.type !== 'visual'

export function useVoiceOver({ ids, lang, enabled }) {
  const [activeId, setActiveId] = useState(null)
  const [finished, setFinished] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const audioRef = useRef(null)
  const seqRef = useRef([])
  const posRef = useRef(0)
  const [token, setToken] = useState(0) // 重新播放的触发令牌

  useEffect(() => {
    // 停止并释放
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setActiveId(null)
    setFinished(false)
    setBlocked(false)
    if (!enabled || !ids?.length) return undefined

    const seq = ids.filter((id) => hasAudio(VO.byId[id]))
    if (!seq.length) return undefined
    seqRef.current = seq
    posRef.current = 0

    let cancelled = false
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const step = () => {
      if (cancelled) return
      if (posRef.current >= seq.length) {
        setActiveId(null)
        // 整段旁白念完 —— 上层用它判断「该催玩家做选择了」
        setFinished(true)
        return
      }
      const id = seq[posRef.current]
      audio.src = voSrc(lang, id)
      setActiveId(id)
      const onEnded = () => {
        posRef.current += 1
        step()
      }
      const onError = () => {
        // 单个音频失败（如 404）不要卡住整条旁白，直接跳下一条
        posRef.current += 1
        step()
      }
      audio.onended = onEnded
      audio.onerror = onError
      const p = audio.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // 自动播放被浏览器拦截
          if (!cancelled) setBlocked(true)
        })
      }
    }
    step()

    return () => {
      cancelled = true
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.src = ''
    }
    // token 变化 = 用户点了「开启语音」重新播放
  }, [ids, lang, enabled, token])

  /* 开启语音 / 从头重播 */
  const resume = useCallback(() => {
    posRef.current = 0
    setBlocked(false)
    setToken((x) => x + 1)
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setActiveId(null)
  }, [])

  return { activeId, finished, blocked, resume, stop }
}
