import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Globe, ChevronRight } from 'lucide-react'
import { LANGS } from '../i18n/ui.js'

/** 根容器氛围光斑（对标参考站 absolute inset-0 opacity-20 blur-3xl 三光斑） */
export function Ambience() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden="true">
      <div className="absolute left-10 top-10 h-32 w-32 animate-orb rounded-full bg-blue-400 blur-3xl" />
      <div
        className="absolute right-20 top-32 h-24 w-24 animate-orb rounded-full bg-cyan-400 blur-2xl"
        style={{ animationDelay: '1s' }}
      />
      <div
        className="absolute bottom-20 left-1/3 h-40 w-40 animate-orb rounded-full bg-indigo-400 blur-3xl"
        style={{ animationDelay: '2s' }}
      />
    </div>
  )
}

/** 可拖拽悬浮声音按钮（对标参考站 fixed 48px 圆形渐变） */
export function SoundButton({ muted, onToggle, label }) {
  const pos = useRef({ top: 18, right: 16 })
  const [style, setStyle] = useState({ top: 18, right: 16 })
  const drag = useRef({ active: false, startY: 0, startTop: 18, moved: false })

  useEffect(() => {
    pos.current = { top: style.top, right: style.right }
  }, [style])

  const start = (y) => {
    drag.current = { active: true, startY: y, startTop: pos.current.top, moved: false }
  }
  const move = (y) => {
    if (!drag.current.active) return
    const dy = y - drag.current.startY
    if (Math.abs(dy) > 6) drag.current.moved = true
    const vh = window.innerHeight
    const top = Math.max(12, Math.min(vh - 72, drag.current.startTop - dy))
    pos.current = { top, right: pos.current.right }
    setStyle({ top, right: pos.current.right })
  }
  const end = () => {
    drag.current.active = false
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!drag.current.moved) onToggle()
      }}
      onTouchStart={(e) => start(e.touches[0].clientY)}
      onTouchMove={(e) => move(e.touches[0].clientY)}
      onTouchEnd={end}
      onMouseDown={(e) => start(e.clientY)}
      onMouseMove={(e) => e.buttons === 1 && move(e.clientY)}
      onMouseUp={end}
      onMouseLeave={end}
      aria-label={label}
      style={{
        position: 'fixed',
        top: style.top,
        right: style.right,
        zIndex: 100,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #06b6d4 60%, #2563eb 100%)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        border: '3px solid #fff',
        transition: 'background 0.2s',
        touchAction: 'none',
      }}
      className="grid place-items-center"
    >
      <span className="grid h-full w-full place-items-center">
        {muted ? (
          <VolumeX size={24} className="shrink-0" />
        ) : (
          <Volume2 size={24} className="shrink-0" />
        )}
      </span>
    </button>
  )
}

/**
 * 语言选择器（对标参考站 bg-black/30 backdrop-blur 容器）
 * inline=true 时随文档流排布（用于顶栏右侧），否则绝对定位在右上角。
 */
export function LanguageSelector({ lang, onChange, inline = false }) {
  return (
    <div className={inline ? 'relative z-20' : 'absolute right-4 top-4 z-20 safe-top'}>
      <div className="rounded-lg border border-blue-500/30 bg-black/30 px-2 py-1 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-blue-400" />
          <select
            value={lang}
            onChange={(e) => onChange(e.target.value)}
            aria-label="language"
            className="cursor-pointer border-none bg-transparent text-xs text-white outline-none"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} className="bg-gray-800 text-white">
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

/**
 * 主标题：顶栏左上角紧凑版（左对齐，不随滚动缩放）。
 * 窄屏放不下一行时，只在「副标题分隔符」处折行 —— 四语标题都带冒号，
 * 这样不会把「斑头雁」这类词从中间劈开。
 */
export function TitleBlock({ t }) {
  const raw = String(t('title'))
  const i = Math.max(raw.indexOf('：'), raw.indexOf(':'))
  const head = i >= 0 ? raw.slice(0, i + 1) : raw
  const tail = i >= 0 ? raw.slice(i + 1) : ''

  return (
    <div className="min-w-0 text-left">
      <h1
        className="break-keep bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text font-bold text-transparent"
        style={{ fontSize: 'clamp(14px, 3.9vw, 28px)', lineHeight: 1.22 }}
      >
        {head}
        {tail && <wbr />}
        {tail}
      </h1>
      <p className="mt-0.5 text-[11px] text-gray-400 sm:text-xs">{t('subtitle')}</p>
    </div>
  )
}

/** 章节标题 + 渐变分隔线 */
export function ChapterTitle({ icon: Icon, label }) {
  return (
    <div className="w-full text-center">
      <h2 className="mb-2 text-3xl font-bold text-cyan-400">
        {Icon && <Icon className="mb-1 mr-2 inline-block h-8 w-8 text-cyan-400" />}
        {label}
      </h2>
      <div className="mx-auto h-1 w-32 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
    </div>
  )
}

/** 「下一步」提示箭头 */
export function NextHint({ children }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-cyan-300/80">
      <ChevronRight className="h-4 w-4" />
      <span>{children}</span>
    </div>
  )
}
