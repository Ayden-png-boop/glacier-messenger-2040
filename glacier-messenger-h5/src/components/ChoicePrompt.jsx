import { ChevronRight } from 'lucide-react'
import { pick } from '../i18n/ui.js'

/** 单个选项按钮（页面内联列表与「该做选择了」弹窗共用同一个，避免两处走样） */
export function ChoiceButton({ choice, locked, lang, t, onChoose }) {
  return (
    <button
      type="button"
      data-choice-id={choice.id}
      onClick={() => onChoose(choice)}
      disabled={locked}
      className={`choice-btn w-full rounded-lg border-2 p-4 text-left ${
        locked
          ? 'cursor-not-allowed border-gray-600 bg-gray-800/50 text-gray-500'
          : 'cursor-pointer border-cyan-400/50 bg-gradient-to-r from-blue-800/50 to-purple-800/50 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-400/20 hover:scale-[1.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{pick(choice.text, lang)}</span>
            {choice.effects &&
              Object.entries(choice.effects).map(([k, v]) => (
                <span
                  key={k}
                  className={`rounded px-2 py-1 text-sm ${
                    v > 0 ? 'bg-green-600/30 text-green-300' : 'bg-red-600/30 text-red-300'
                  }`}
                >
                  {t(k)} {v > 0 ? '+' : ''}
                  {v}
                </span>
              ))}
            {choice.qte && (
              <span className="rounded bg-amber-600/30 px-2 py-1 text-sm text-amber-300">QTE</span>
            )}
          </div>
          <p className="text-sm text-gray-300">{pick(choice.description, lang)}</p>
          {locked && choice.conditionHint && (
            <p className="mt-2 text-sm text-red-400">
              {t('conditionNotMet')} · {pick(choice.conditionHint, lang)}
            </p>
          )}
        </div>
        {!locked && <ChevronRight className="h-6 w-6 shrink-0 text-cyan-400" />}
      </div>
    </button>
  )
}

/**
 * 「看完/听完还没做选择」时的催选弹窗：
 * 旁白念完 + 正片播过一遍，玩家仍未点选项 → 直接把选项搬到弹窗里。
 */
export default function ChoicePrompt({ t, lang, choices, game, conditionMet, onChoose, onDismiss }) {
  return (
    <div
      data-choice-prompt
      className="fixed inset-0 z-[55] flex w-full items-end justify-center bg-black/75 p-3 sm:items-center"
    >
      <div
        className="animate-fade-up w-full max-w-lg overflow-y-auto rounded-2xl border border-cyan-400/50 bg-gradient-to-b from-blue-900/95 to-slate-900/95 p-4 shadow-2xl backdrop-blur-sm"
        style={{ maxHeight: 'var(--vh85, 85vh)' }}
      >
        <h3 className="text-center text-xl font-semibold text-cyan-300">{t('choicePrompt')}</h3>
        <p className="mb-3 mt-1 text-center text-xs text-gray-300">{t('choiceNowBody')}</p>

        <div className="space-y-2">
          {choices.map((choice) => (
            <ChoiceButton
              key={choice.id}
              choice={choice}
              locked={!conditionMet(choice, game.state, game.stats)}
              lang={lang}
              t={t}
              onChoose={onChoose}
            />
          ))}
        </div>

        <button
          type="button"
          data-choice-later
          onClick={onDismiss}
          className="mt-3 w-full rounded-lg border border-gray-500/50 py-2 text-sm text-gray-300 hover:bg-white/5"
        >
          {t('choiceLater')}
        </button>
      </div>
    </div>
  )
}
