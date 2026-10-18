/** 扫描英文文案中是否混入法语/中文残留 */
import { CHAPTERS, ENDINGS } from '../glacier-messenger-h5/src/story/story.js'
import { UI } from '../glacier-messenger-h5/src/i18n/ui.js'

const FR = /\b(l'|d'|le|la|les|des|une|nous|vous|est|sont|dans|pour|avec|cette|ces|glaciers?|monde|leur|leurs)\b/gi
const bad = []
const walk = (o, path) => {
  if (o == null || typeof o === 'string') return
  if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`))
  if (typeof o === 'object') {
    if (typeof o.en === 'string') {
      const s = o.en
      if (/[぀-ヿ一-鿿]/.test(s)) bad.push([path, '含中日文字符', s.slice(0, 50)])
      else {
        const hits = [...new Set(s.match(FR) || [])]
        if (hits.length >= 2) bad.push([path, `疑似法语(${hits.slice(0, 3).join(',')})`, s.slice(0, 60)])
      }
    }
    for (const k of Object.keys(o)) if (k !== 'en') walk(o[k], `${path}.${k}`)
  }
}
walk(CHAPTERS, 'CHAPTERS')
walk(ENDINGS, 'ENDINGS')
walk(UI, 'UI')
console.log('可疑 en 字段数:', bad.length)
bad.forEach((b) => console.log('  ', b[0], '|', b[1], '|', b[2]))
