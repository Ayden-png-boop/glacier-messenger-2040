/** 抽查四语对齐质量：打印若干条目的四语文本，人工核对是否语义对应 */
import { readFileSync } from 'node:fs'

const m = JSON.parse(readFileSync('C:/Users/-/Desktop/冰川信使海外版/output/voice-overs/_manifest.json', 'utf-8'))
const ids = process.argv.slice(2)
const items = ids.length ? m.items.filter((x) => ids.includes(x.id)) : m.items.slice(0, 8)

for (const it of items) {
  console.log('═'.repeat(70))
  console.log(`${it.id}  [${it.typeLabel}]  ${it.speaker ? '说话者:' + it.speaker : ''}  ${it.scene}`)
  for (const L of ['zh', 'en', 'ja', 'fr']) {
    const t = (it.texts[L] || '').replace(/\n/g, ' ')
    console.log(`  ${L}: ${t.slice(0, 110)}${t.length > 110 ? '…' : ''}`)
  }
}
