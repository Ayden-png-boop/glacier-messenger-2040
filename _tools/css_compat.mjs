/**
 * 老浏览器 CSS 兼容兜底（构建后处理，幂等）
 *
 * Tailwind v4 的官方基线是 Chrome 111+ / Safari 16.4+ / Firefox 128+。
 * 低于该基线的浏览器（国内大量 App 内置 WebView：微信 X5 老内核、UC、QQ、
 * 百度、360；Chrome 78~110；Safari 15.x）会有四层问题，这里逐一兜底：
 *
 *  1. @layer：Chrome <99 / Safari <15.4 不认 @layer at-rule，会**整块丢弃**，
 *     等于全站无样式。→ 展平（去掉 @layer 包装，保留内容）。
 *     展平后所有规则变未分层，但源码顺序不变（theme < base < utilities），
 *     层叠结果与本项目的自定义 CSS 保持一致。
 *  2. oklch()：色板全部用 oklch 定义，老浏览器解析不了 → var() 在
 *     computed-value time 变 invalid → 文字继承父色、背景透明、渐变消失。
 *     → 转成 hex（OKLab → linear sRGB → sRGB，超出色域裁剪）。
 *  3. color-mix()：Tailwind 把 /30 /40 /50 这类半透明色包在
 *     @supports(color-mix) 里，不支持时整条规则被跳过 → 背景/边框全丢。
 *     → 转成 rgba()。
 *  4. `linear-gradient(to right in oklab, ...)`：`in oklab` 插值语法 Chrome
 *     111+ 才有，写进去整条 background-image 失效 → 标题（bg-clip-text）
 *     会直接看不见。→ 去掉 `in oklab`。
 *
 * 用法：node _tools/css_compat.mjs [dist/assets 目录]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..')
const ASSETS = process.argv[2] || path.join(ROOT, 'glacier-messenger-h5', 'dist', 'assets')

/* ─────────── 1. @layer 展平 ─────────── */

function flattenLayers(css) {
  const re = /@layer\s+[\w.-]+\s*\{/g
  let out = ''
  let i = 0
  let m
  while ((m = re.exec(css))) {
    out += css.slice(i, m.index)
    i = m.index + m[0].length
    let depth = 1
    let j = i
    while (depth > 0 && j < css.length) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    out += flattenLayers(css.slice(i, j - 1)) // 递归：layer 可能嵌套
    i = j
    re.lastIndex = i
  }
  return out + css.slice(i)
}

/* ─────────── 2. 色彩空间：oklch → sRGB ─────────── */

function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const enc = (v) => {
  const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(x * 255)))
}

/** 'oklch(63.7% .237 25.331)' → [251, 44, 54] */
function parseOklch(str) {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+%|[\d.]+)\s+([\d.]+)\s*\)?$/.exec(str.trim())
  if (!m) return null
  const L = parseFloat(m[1]) / 100
  const C = m[2].endsWith('%') ? (parseFloat(m[2]) / 100) * 0.4 : parseFloat(m[2])
  const H = parseFloat(m[3])
  return oklchToLinear(L, C, H).map(enc)
}

const toHex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('')
const toRgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(a * 1000) / 1000})`

/* ─────────── 3. 解析 ─────────── */

function latestCss(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  return files.length ? path.join(dir, files[0].f) : null
}

function collectVars(css) {
  const vars = new Map()
  for (const m of css.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    const name = m[1]
    const raw = m[2].trim()
    if (vars.has(name)) continue
    if (raw.startsWith('oklch(')) {
      const c = parseOklch(raw)
      if (c) vars.set(name, c)
    } else if (/^#[0-9a-f]{3,8}$/i.test(raw)) {
      let h = raw.slice(1)
      if (h.length === 3) h = h.split('').map((x) => x + x).join('')
      vars.set(name, [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ])
    }
  }
  return vars
}

/**
 * 把一条规则文本拆成 [选择器, 声明串]。
 * 必须以 `.` 锚定：Tailwind 把 color-mix 规则包在 `@supports(...){...}` 里，
 * 若从任意位置起匹配，抓到的「选择器」会是整条 @supports 条件。
 */
function rulesWith(css, needle) {
  const out = []
  const re = new RegExp(`\\.[^{}]+\\{[^}]*${needle}[^}]*\\}`, 'g')
  for (const m of css.matchAll(re)) {
    const rule = m[0]
    const bi = rule.indexOf('{')
    out.push([rule.slice(0, bi).trim(), rule.slice(bi + 1, rule.lastIndexOf('}'))])
  }
  return out
}

/** `.bg-cyan-400\/30{color:color-mix(in oklab,var(--color-cyan-400) 30%,transparent)}` → rgba */
function collectColorMix(css, vars) {
  const out = new Map()
  for (const [sel, decls] of rulesWith(css, 'color-mix\\(')) {
    const cm = /color-mix\(\s*in\s+oklab\s*,\s*var\((--color-[a-z0-9-]+)\)\s*([\d.]+)%\s*,\s*transparent\s*\)/.exec(decls)
    if (!cm) continue
    const c = vars.get(cm[1])
    const prop = /([\w-]+)\s*:\s*color-mix/.exec(decls)?.[1]
    if (!c || !prop) continue
    out.set(sel, `${prop}:${toRgba(c, parseFloat(cm[2]) / 100)}`)
  }
  return out
}

/** `--tw-gradient-position:to right in oklab` → 去掉 `in oklab` */
function collectGradientPos(css) {
  const out = new Map()
  for (const [sel, decls] of rulesWith(css, '--tw-gradient-position\\s*:\\s*')) {
    const val = /--tw-gradient-position\s*:\s*([^;}]+)/.exec(decls)?.[1]
    if (!val || !val.includes('in oklab')) continue
    out.set(sel, `--tw-gradient-position:${val.replace(/\s*in\s+oklab\s*/g, ' ').trim()}`)
  }
  return out
}

/* ─────────── 4. 生成 ─────────── */

function build() {
  const cssPath = latestCss(ASSETS)
  if (!cssPath) {
    console.error('[css-compat] 找不到 CSS 产物')
    process.exit(1)
  }
  let css = fs.readFileSync(cssPath, 'utf8')

  // 幂等：先剥掉上次追加的兜底块
  css = css.replace(/\/\* ==GM-COMPAT-BEGIN== \*\/[\s\S]*?\/\* ==GM-COMPAT-END== \*\/\n?/g, '')

  let cssFlat = flattenLayers(css)
  const removedLayers = (css.match(/@layer\s+[\w.-]+\s*\{/g) || []).length
  // 展平后可能残留独立的层序声明（@layer components;）—— 老浏览器同样不认，一并去掉
  cssFlat = cssFlat.replace(/@layer\s+[\w.-.,\s]*;/g, '')

  const vars = collectVars(cssFlat)
  const mix = collectColorMix(cssFlat, vars)
  const grad = collectGradientPos(cssFlat)

  const palette = [...vars.entries()].map(([k, v]) => `${k}:${toHex(v)}`).join(';')
  const mixRules = [...mix.entries()].map(([s, d]) => `${s}{${d}}`).join('')
  const gradRules = [...grad.entries()].map(([s, d]) => `${s}{${d}}`).join('')

  const chunk = [
    '/* ==GM-COMPAT-BEGIN== 老浏览器兜底（oklch/color-mix/in-oklab），自动生成勿手改 */',
    '@supports not (color:oklch(50% 0 0)){',
    `:root{${palette}}`,
    gradRules,
    mixRules,
    '}',
    // Safari 15.4~16.1：认得 oklch 但不认 color-mix / in oklab，色板保持原样
    '@supports (color:oklch(50% 0 0)) and (not (color:color-mix(in oklab,red,red))){',
    gradRules,
    mixRules,
    '}',
    '/* ==GM-COMPAT-END== */',
    '',
  ].join('')

  fs.writeFileSync(cssPath, cssFlat.trimEnd() + '\n' + chunk, 'utf8')

  console.log(
    `[css-compat] ${path.basename(cssPath)}: 展平 @layer×${removedLayers} / 色板 ${vars.size} / color-mix ${mix.size} / 渐变 ${grad.size} / +${chunk.length}B / 剩 @layer ${(cssFlat.match(/@layer/g) || []).length}`,
  )
}

build()
