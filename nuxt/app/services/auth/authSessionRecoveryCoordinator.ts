import type { AuthSessionStatus } from './authSessionPolicy'

type RecoveryEventTarget = {
  addEventListener: (type: 'online' | 'focus', listener: () => void) => void
}

export function createAuthSessionRecoveryCoordinator<T>({
  getStatus,
  getRecoverableTarget,
  retryTarget,
  getEventTarget,
  delaysMs = [2000, 5000, 15000, 30000],
  onChange,
}: {
  getStatus: () => AuthSessionStatus
  getRecoverableTarget: () => T | null
  retryTarget: (target: T) => Promise<void>
  getEventTarget: () => RecoveryEventTarget | null
  delaysMs?: number[]
  onChange?: () => void
}) {
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let triggersInstalled = false

  function notify() {
    onChange?.()
  }

  function clear({ resetAttempts = true } = {}) {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (resetAttempts) retryAttempt = 0
    notify()
  }

  // True once the bounded backoff is spent and nothing is pending: the UI
  // then offers a manual retry instead of spinning forever.
  function isExhausted() {
    return retryAttempt >= delaysMs.length && !retryTimer && !inFlight
  }

  function schedule() {
    if (
      retryTimer
      || inFlight
      || !getRecoverableTarget()
      || getStatus() !== 'recoverable'
      || retryAttempt >= delaysMs.length
    ) {
      notify()
      return
    }

    const delayMs = delaysMs[retryAttempt++]
    if (delayMs === undefined) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void retryNow()
    }, delayMs)
    notify()
  }

  async function retryNow() {
    const target = getRecoverableTarget()
    if (inFlight || !target || getStatus() !== 'recoverable') return
    inFlight = retryTarget(target).finally(() => {
      inFlight = null
      if (getStatus() === 'recoverable') schedule()
      else notify()
    })
    notify()
    return inFlight
  }

  // A deliberate user action (button, online, focus) restarts the backoff.
  function retryFromUser() {
    if (getStatus() !== 'recoverable') return Promise.resolve()
    clear()
    return retryNow()
  }

  function installTriggers() {
    if (triggersInstalled) return
    const target = getEventTarget()
    if (!target) return
    triggersInstalled = true
    const retryFromUserSignal = () => { void retryFromUser() }
    target.addEventListener('online', retryFromUserSignal)
    target.addEventListener('focus', retryFromUserSignal)
  }

  return { clear, schedule, retryNow, retryFromUser, isExhausted, installTriggers }
}
