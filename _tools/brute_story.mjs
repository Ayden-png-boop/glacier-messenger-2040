/**
 * 穷举全部剧情路径，验证三个结局的可达性 + 数值钳制正确性。
 * 规则与 engine.js 保持一致（clamp 0-100）。
 */
import { CHAPTERS, ENDINGS, INITIAL_STATS, INITIAL_STATE, INITIAL_CHAPTER } from '../glacier-messenger-h5/src/story/story.js'

const clamp = (n) => Math.max(0, Math.min(100, n))
const applyEffects = (stats, effects) => {
  const next = { ...stats }
  for (const [k, v] of Object.entries(effects || {})) {
    if (typeof next[k] !== 'number') continue
    next[k] = clamp(next[k] + v)
  }
  return next
}

const results = {}
const endingPaths = {}
const c8aStats = []
let total = 0

function walk(chapterId, stats, state, path, depth) {
  const ch = CHAPTERS.find((c) => c.id === chapterId)
  if (!ch) return
  for (const choice of ch.choices) {
    if (chapterId === 8 && choice.id === 'c8a') {
      c8aStats.push({ path, stats: { ...stats }, state: { ...state }, can: !choice.condition || !!choice.condition(state, stats) })
    }
    const canChoose = !choice.condition || !!choice.condition(state, stats)
    if (!canChoose) continue
    const ns = applyEffects(stats, choice.effects)
    const st = choice.nextState ? { ...state, ...choice.nextState } : { ...state }
    const newPath = [...path, choice.id]

    let ending = choice.ending || null
    if (!ending && choice.endingRule) ending = choice.endingRule(st, ns)
    if (ending) {
      total++
      const score = ns.cooperation * 0.7 + ns.health * 0.4 - ns.radical * 0.1
      results[ending] = (results[ending] || 0) + 1
      if (!endingPaths[ending]) endingPaths[ending] = { path: newPath, stats: ns, score }
      continue
    }
    const nextId = choice.nextChapter ?? CHAPTERS[CHAPTERS.findIndex((c) => c.id === chapterId) + 1]?.id
    if (nextId == null) continue
    walk(nextId, ns, st, newPath, depth + 1)
  }
}

walk(INITIAL_CHAPTER, { ...INITIAL_STATS }, { ...INITIAL_STATE }, [], 0)

console.log('=== 结局可达性（穷举全部可行路径）===')
console.log('可达路径总数:', total)
for (const k of Object.keys(ENDINGS)) {
  console.log(`  ${k.padEnd(12)} : ${results[k] || 0} 条路径` + (endingPaths[k] ? '  ✓ 可达' : '  ✗ 不可达'))
}
console.log()
console.log('=== 每个结局的一条代表路径 ===')
for (const [k, v] of Object.entries(endingPaths)) {
  console.log(`  ${k}: ${v.path.join(' → ')}`)
  console.log(`      数值=${JSON.stringify(v.stats)}  得分=${v.score.toFixed(1)}`)
}
console.log()
console.log('=== 第8章前的数值分布（诊断）===')
console.log('  c8a 可用(合作>=阈值)的路径数:', c8aStats.length)
const via = c8aStats.filter((x) => x.state.sacrificed).length
console.log(`  其中经过 c7a(牺牲) 的: ${via} / 未牺牲的: ${c8aStats.length - via}`)
console.log('  样本(前8条):')
for (const x of c8aStats.slice(0, 8)) {
  console.log(
    `    ${x.path.slice(0, 7).join(',')} | 合作=${x.stats.cooperation} 体力=${x.stats.health} 牺牲=${x.state.sacrificed}`,
  )
}

console.log()
console.log('=== 结局键 ===')
console.log(Object.keys(ENDINGS).join(', '))
for (const [k, v] of Object.entries(ENDINGS)) {
  console.log(`  ${k}: ${v.title?.zh || '(no title)'}`)
}

// 找出不含 QTE（c3a）的 adaptation 路径，供浏览器实机验证
const noQte = []
function walk2(chapterId, stats, state, path) {
  const ch = CHAPTERS.find((c) => c.id === chapterId)
  if (!ch) return
  for (const choice of ch.choices) {
    if (choice.id === 'c3a') continue
    if (choice.condition && !choice.condition(state, stats)) continue
    const ns = applyEffects(stats, choice.effects)
    const st = choice.nextState ? { ...state, ...choice.nextState } : { ...state }
    const p = [...path, choice.id]
    let ending = choice.ending || (choice.endingRule ? choice.endingRule(st, ns) : null)
    if (ending) {
      if (ending === 'adaptation') noQte.push({ path: p, stats: ns })
      continue
    }
    const nextId = choice.nextChapter ?? CHAPTERS[CHAPTERS.findIndex((c) => c.id === chapterId) + 1]?.id
    if (nextId == null) continue
    walk2(nextId, ns, st, p)
  }
}
walk2(INITIAL_CHAPTER, { ...INITIAL_STATS }, { ...INITIAL_STATE }, [])
console.log()
console.log('=== 不含 QTE 的 adaptation 路径 ===')
noQte.slice(0, 5).forEach((x) => console.log('  ', x.path.join(','), JSON.stringify(x.stats)))
