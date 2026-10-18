/**
 * 剧情引擎 —— 纯函数集合，对标参考站状态机。
 * 数值一律 0–100 钳制；得分公式与参考站一致。
 */
import { CHAPTERS, INITIAL_STATS, INITIAL_STATE, INITIAL_CHAPTER } from './story.js'

const clamp = (n) => Math.max(0, Math.min(100, n))

export const freshGame = () => ({
  chapterId: INITIAL_CHAPTER,
  ending: null, // null | 'hope' | 'adaptation' | 'doom'
  stats: { ...INITIAL_STATS },
  state: { ...INITIAL_STATE },
  history: [], // 已做过的选择 id，用于结局回放与统计
})

/** 叠加数值效果（负值最低扣到 0，不穿底） */
export function applyEffects(stats, effects) {
  if (!effects) return { ...stats }
  const next = { ...stats }
  for (const [k, v] of Object.entries(effects)) {
    if (typeof next[k] !== 'number') continue
    next[k] = clamp(next[k] + v)
  }
  return next
}

/** 合并状态位 */
export function applyNextState(state, nextState) {
  return nextState ? { ...state, ...nextState } : { ...state }
}

/** 条件是否满足（choice.condition 为空即视为满足） */
export function conditionMet(choice, state, stats) {
  if (!choice?.condition) return true
  try {
    return !!choice.condition(state, stats)
  } catch {
    return false
  }
}

/**
 * 结算结局：choice.ending 优先（字面量），
 * 其次 endingRule(state, stats)（用于按累计状态细分 hope/adaptation）。
 */
export function resolveEnding(choice, state, stats) {
  if (choice?.ending) return choice.ending
  if (choice?.endingRule) {
    try {
      return choice.endingRule(state, stats)
    } catch {
      return 'doom'
    }
  }
  return null
}

/** 综合得分：合作×0.7 + 体力×0.4 − 激进×0.1（与参考站公式一致） */
export function computeScore(stats) {
  return stats.cooperation * 0.7 + stats.health * 0.4 - stats.radical * 0.1
}

export function getChapter(id) {
  return CHAPTERS.find((c) => c.id === id) || null
}

/** 下一节点 id：choice.nextChapter > chapter.id + 1 > null */
export function nextChapterOf(choice, chapterId) {
  if (choice?.nextChapter) return choice.nextChapter
  const ch = getChapter(chapterId)
  const idx = CHAPTERS.findIndex((c) => c.id === chapterId)
  if (ch && idx >= 0 && idx + 1 < CHAPTERS.length) return CHAPTERS[idx + 1].id
  return null
}

/**
 * 把一次选择翻译成引擎事件，供 App 消费。
 * 返回 { stats, state, ending, nextChapterId, hasAnimation, hasQte }
 */
export function commitChoice(current, choice) {
  const chapter = getChapter(current.chapterId)
  const stats = applyEffects(current.stats, choice.effects)
  const state = applyNextState(current.state, choice.nextState)
  const ending = resolveEnding(choice, state, stats)
  const nextChapterId = ending ? null : nextChapterOf(choice, current.chapterId)
  return {
    stats,
    state,
    ending,
    nextChapterId,
    hasAnimation: !!choice.animation,
    hasQte: !!choice.qte && chapter?.id === 3 && choice.id === 'c3a',
  }
}

/** 收集「该章节所有视频」：正片 + 每个分支的后果片 */
export function chapterVideoSet(chapterId) {
  const ch = getChapter(chapterId)
  if (!ch) return []
  const out = [ch.video, ...ch.choices.map((c) => c.animation).filter(Boolean)]
  return [...new Set(out.filter(Boolean))]
}
