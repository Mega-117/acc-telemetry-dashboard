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
}: {
  getStatus: () => AuthSessionStatus
  getRecoverableTarget: () => T | null
  retryTarget: (target: T) => Promise<void>
  getEventTarget: () => RecoveryEventTarget | null
  delaysMs?: number[]
}) {
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let triggersInstalled = false

  function clear({ resetAttempts = true } = {}) {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (resetAttempts) retryAttempt = 0
  }

  function schedule() {
    if (
      retryTimer
      || inFlight
      || !getRecoverableTarget()
      || getStatus() !== 'recoverable'
      || retryAttempt >= delaysMs.length
    ) return

    const delayMs = delaysMs[retryAttempt++]
    if (delayMs === undefined) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void retryNow()
    }, delayMs)
  }

  async function retryNow() {
    const target = getRecoverableTarget()
    if (inFlight || !target || getStatus() !== 'recoverable') return
    inFlight = retryTarget(target).finally(() => {
      inFlight = null
      if (getStatus() === 'recoverable') schedule()
    })
    return inFlight
  }

  function installTriggers() {
    if (triggersInstalled) return
    const target = getEventTarget()
    if (!target) return
    triggersInstalled = true
    const retryFromUserSignal = () => {
      if (getStatus() !== 'recoverable') return
      clear()
      void retryNow()
    }
    target.addEventListener('online', retryFromUserSignal)
    target.addEventListener('focus', retryFromUserSignal)
  }

  return { clear, schedule, retryNow, installTriggers }
}
