import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, Globe, User, Mail } from 'lucide-react'
import { LANGS } from '../i18n/ui.js'
import PooledVideo from './PooledVideo.jsx'

/**
 * 抉择后的过渡浮层（对标参考站 Xt / ce 两个浮层）：
 *  - kind='animation'：播放分支后果视频，播完自动进入下一节点（视频时长即节奏）
 *  - kind='loading'  ：3 秒转场 loading（无后果视频的选择）
 */
export function TransitionOverlay({ pool, kind, videoName, text, muted, volume, lang = 'zh', onBlocked, onDone }) {
  const timerRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const firedRef = useRef(false)

  /* 兜底推进只认一次：onEnded 与超时可能同时到达，重复推进会连跳两章 */
  const finish = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    doneRef.current?.()
  }, [])

  const arm = useCallback((ms) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(finish, ms)
  }, [finish])

  useEffect(() => {
    firedRef.current = false
    if (kind === 'loading') {
      arm(3000)
      return () => clearTimeout(timerRef.current)
    }
    // animation 模式：视频 onEnded 触发；12s 兜底防卡死
    arm(12000)
    return () => clearTimeout(timerRef.current)
  }, [kind, videoName, arm])

  /* 视频就绪后按真实时长放宽兜底 —— 否则长于 12 秒的后果片会被硬截断 */
  const onReady = useCallback(
    (el) => {
      const d = el?.duration
      if (d && Number.isFinite(d) && d > 0) arm(Math.ceil(d * 1000) + 3000)
    },
    [arm],
  )

  return (
    <div className="fixed inset-0 z-50 flex w-full items-center justify-center bg-black/80 p-4">
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-lg border border-cyan-400/50 bg-gradient-to-r from-blue-900/80 to-cyan-900/80 p-4 text-center backdrop-blur-sm">
        {kind === 'animation' && videoName ? (
          <PooledVideo
            pool={pool}
            name={videoName}
            loop={false}
            muted={muted}
            volume={volume}
            shellClass="mb-4 w-full"
            lang={lang}
            onEnded={finish}
            onReady={onReady}
            onBlocked={onBlocked}
          />
        ) : (
          <div className="my-4 mx-auto h-16 w-16 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
        )}
        <p className="mt-2 w-full text-center text-lg text-cyan-200 story-text">
          <Loader2 className="mb-1 mr-2 inline-block h-5 w-5" />
          {text}
        </p>
      </div>
    </div>
  )
}

/** 微信内打开引导（对标参考站 Wu 组件，仅检测到微信 UA 时弹一次）
 *  copied: null=未操作 / true=成功 / false=失败（老内核没有剪贴板 API，要提示手动复制） */
export function WechatGuide({ t, onClose, onCopy, copied = null }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mb-4">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
        </div>
        <h3 className="mb-2 text-lg font-bold text-gray-900">{t('wechatTitle')}</h3>
        <p className="mb-4 text-sm leading-relaxed text-gray-600">{t('wechatBody')}</p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onCopy}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            {copied === true ? t('copied') : copied === false ? t('copyFail') : t('copyLink')}
          </button>
          {copied === false && (
            <p className="text-xs text-red-600">{t('copyFailHint')}</p>
          )}
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p className="my-1 font-bold">{t('usageTitle')}</p>
            <p>{t('usage1')}</p>
            <p>{t('usage2')}</p>
            <p className="my-1 font-bold">{t('orLabel')}</p>
            <p>{t('usage3')}</p>
            <p>{t('usage4')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800 transition-colors hover:bg-gray-300"
          >
            {t('stayInWechat')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 开局「参与方式」弹窗 —— 严格对标参考站 zh 组件：
 * 白卡 + 右上语言选择器 + 欢迎标题 + 匿名勾选 + 姓名(必填)/邮箱(可选) + 隐私说明。
 * 参考站在 intro 阶段且未登记玩家时弹出，此处以 localStorage 记录代替后端 playerData。
 */
export function RegisterModal({ t, lang, onLangChange, onSubmit }) {
  const [form, setForm] = useState({ name: '', email: '', isAnonymous: false })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const change = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }))
  }

  /* 与参考站同规则：匿名时跳过校验；姓名必填；邮箱仅在填写时校验格式 */
  const validate = () => {
    const e = {}
    if (!form.isAnonymous) {
      if (!form.name.trim()) e.name = t('namePlaceholder')
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t('emailInvalid')
    }
    return e
  }

  const submit = async (e) => {
    e?.preventDefault()
    const found = validate()
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }
    setBusy(true)
    try {
      await onSubmit(form)
    } finally {
      setBusy(false)
    }
  }

  const startAnonymous = () => submit()

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="animate-pop w-full max-w-md rounded-lg bg-white p-4 shadow-2xl">
        {/* 右上角语言选择器 */}
        <div className="relative mb-4 flex justify-end">
          <div className="rounded-lg border border-blue-500/30 bg-black/10 p-1 backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <span className="text-blue-400">
                <Globe className="h-4 w-4" />
              </span>
              <select
                value={lang}
                onChange={(e) => onLangChange?.(e.target.value)}
                className="cursor-pointer border-none bg-transparent text-sm text-gray-800 outline-none"
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code} className="bg-gray-100 text-gray-800">
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mb-6 text-center">
          <h2 className="mb-2 text-2xl font-bold text-gray-800">{t('welcomeTitle')}</h2>
          <p className="text-gray-600">{t('welcomeSubtitle')}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isAnonymous"
              name="isAnonymous"
              checked={form.isAnonymous}
              onChange={change}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isAnonymous" className="flex items-center text-sm text-gray-700">
              <User className="mr-1 h-4 w-4" />
              {t('anonymous')}
            </label>
          </div>

          {!form.isAnonymous && (
            <>
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('nameLabel')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={form.name}
                    onChange={change}
                    maxLength={20}
                    placeholder={t('namePlaceholder')}
                    className={`w-full rounded-md border py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('emailLabel')} <span className="text-gray-400">{t('emailOptional')}</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={form.email}
                    onChange={change}
                    placeholder={t('emailPlaceholder')}
                    className={`w-full rounded-md border py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.email ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
              </div>
            </>
          )}

          {errors.submit && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            {form.isAnonymous ? (
              <button
                type="button"
                onClick={startAnonymous}
                disabled={busy}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? t('entering') : t('startAnonymous')}
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? t('registering') : t('startGame')}
              </button>
            )}
          </div>
        </form>

        <div className="mt-6 rounded-md bg-gray-50 p-3">
          <p className="text-xs text-gray-600">{t('privacy')}</p>
        </div>
      </div>
    </div>
  )
}
