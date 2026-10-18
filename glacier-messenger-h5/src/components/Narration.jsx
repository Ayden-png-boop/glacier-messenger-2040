import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { pick } from '../i18n/ui.js'

/**
 * 按句切分纯文本（无 VO 分段时的兜底）。
 * 不用 lookbehind（iOS 16.4 以下不支持），用「非终止符 + 可选的终止符」整体匹配。
 */
export function splitSentences(raw) {
  const m = String(raw || '').match(/[^。！？!?…]+[。！？!?…]?/g)
  return (m || []).map((s) => s.trim()).filter(Boolean)
}

/**
 * 剧情旁白：默认只显示「当前这一句」，点「展开全文」才铺开整段。
 *
 * 折叠态跟着配音走 —— 念到第几句就显示第几句（像字幕），念完停在最后一句；
 * 配音关闭或本段无 VO 时停在最后停留的那句（初始第一句）。
 */
export default function Narration({
  segs = [],
  fallback = '',
  activeId,
  lang,
  t,
  blocked = false,
  onResume,
  blockedLabel = '',
}) {
  const [open, setOpen] = useState(false)
  const lastIdxRef = useRef(0)

  const items = useMemo(() => {
    if (segs.length) {
      return segs.map((s) => ({
        id: s.id,
        text: `${s.speaker ? `${s.speaker}：` : ''}${pick(s.t, lang)}${lang === 'zh' || lang === 'ja' ? '' : ' '}`,
      }))
    }
    return splitSentences(fallback).map((text, i) => ({ id: `p-${i}`, text }))
  }, [segs, fallback, lang])

  if (!items.length) {
    return <p className="text-lg leading-relaxed text-gray-100 story-text">{fallback}</p>
  }

  const activeIdx = items.findIndex((x) => x.id === activeId)
  if (activeIdx >= 0) lastIdxRef.current = activeIdx
  const idx = activeIdx >= 0 ? activeIdx : Math.min(lastIdxRef.current, items.length - 1)
  const shown = open ? items : [items[idx]]

  return (
    <div>
      <p className="text-lg leading-relaxed story-text" data-vo-active={activeId || ''}>
        {shown.map((it) => {
          const highlight = !open || it.id === activeId
          return (
            <span
              key={it.id}
              data-vo-id={it.id}
              className={
                highlight
                  ? 'text-cyan-50 font-semibold transition-colors duration-300'
                  : 'text-gray-400 transition-colors duration-300'
              }
            >
              {it.text}
            </span>
          )
        })}
      </p>

      {items.length > 1 && (
        <button
          type="button"
          data-narration-toggle
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 rounded border border-cyan-400/40 px-2 py-0.5 text-xs text-cyan-200 hover:bg-cyan-400/10"
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {open ? t('narrationCollapse') : t('narrationExpand')}
          {!open && <span className="text-cyan-300/60"> · {t('sentOf', { i: idx + 1, n: items.length })}</span>}
        </button>
      )}

      {blocked && (
        <button
          type="button"
          data-vo-resume
          onClick={onResume}
          className="mt-3 block rounded border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs text-amber-100"
        >
          {blockedLabel}
        </button>
      )}
    </div>
  )
}
