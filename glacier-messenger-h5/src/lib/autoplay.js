/**
 * 自动播放解锁器。
 *
 * 手机内核对「无手势起播」的判定非常保守：
 *  - Chrome / 微信 Android：页面没有任何用户交互时，有声 play() 一律拒；
 *  - iOS Safari：静音 + playsinline 可以自动播，但解除静音那一刻会重新判策略；
 *  - iOS 低电量模式：连静音视频都拒，只能等一次真实手势。
 *
 * 所以这里做两件事：
 *  1. 记住「页面已经被真实手势解锁过」——之后的 play() 才值得尝试带声音；
 *  2. 任意一次点击 / 触摸，同步地把所有注册过的「待起播」回调跑一遍。
 *     必须是同步执行：iOS 只认同一个调用栈里的 play()，晚一个 microtask 就失效。
 *
 * 目的：玩家永远不需要看见「轻触播放」按钮，视频自己就会动。
 */

let unlocked = false
const listeners = new Set()
let installed = false

/** 页面是否已经被真实用户手势解锁过 */
export function userGestureSeen() {
  return unlocked
}

function fire() {
  unlocked = true
  // 复制一份再遍历：回调里可能同步注销（视频卸载）
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      /* 单个回调失败不能拖累其它视频 */
    }
  }
}

/**
 * 注册「有手势时重试起播」的回调，返回注销函数。
 * 注意：不是一次性监听 —— 视频中途被内核暂停后，下一次点击还要能救回来。
 */
export function onUserGesture(fn) {
  if (typeof document === 'undefined') return () => {}
  install()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function install() {
  if (installed) return
  installed = true
  const opts = { capture: true, passive: true }
  // pointerdown/touchstart 保证「最早时机」，click 兜住老内核只发 click 的情况
  for (const type of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, fire, opts)
  }
  // 从后台切回来：部分内核会重置播放策略，借这一次机会补播
  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) fire()
    },
    false,
  )
}
