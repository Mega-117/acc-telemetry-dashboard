// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthSessionRecoveryCoordinator } from '~/services/auth/authSessionRecoveryCoordinator'

afterEach(() => {
  vi.useRealTimers()
})

describe('auth session recovery coordinator', () => {
  function setup() {
    let status: 'recoverable' | 'ready' = 'recoverable'
    const user = { uid: 'pilot-1' } as any
    const listeners = new Map<string, () => void>()
    const retryUser = vi.fn().mockResolvedValue(undefined)
    const coordinator = createAuthSessionRecoveryCoordinator({
      getStatus: () => status,
      getRecoverableUser: () => status === 'recoverable' ? user : null,
      retryUser,
      getEventTarget: () => ({
        addEventListener: (type, listener) => listeners.set(type, listener),
      }),
      delaysMs: [10, 20],
    })
    return {
      coordinator,
      listeners,
      retryUser,
      markReady: () => { status = 'ready' },
    }
  }

  it('ritenta con backoff bounded mentre lo stato resta recuperabile', async () => {
    vi.useFakeTimers()
    const { coordinator, retryUser } = setup()
    coordinator.schedule()

    await vi.advanceTimersByTimeAsync(10)
    expect(retryUser).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20)
    expect(retryUser).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(retryUser).toHaveBeenCalledTimes(2)
  })

  it('online e focus riarmano un retry immediato senza duplicare listener', async () => {
    const { coordinator, listeners, retryUser } = setup()
    coordinator.installTriggers()
    coordinator.installTriggers()

    listeners.get('online')?.()
    await vi.waitFor(() => expect(retryUser).toHaveBeenCalledTimes(1))
    listeners.get('focus')?.()
    await vi.waitFor(() => expect(retryUser).toHaveBeenCalledTimes(2))
    expect(listeners.size).toBe(2)
  })

  it('cancella i retry quando la sessione torna pronta', async () => {
    vi.useFakeTimers()
    const { coordinator, retryUser, markReady } = setup()
    coordinator.schedule()
    markReady()
    coordinator.clear()

    await vi.advanceTimersByTimeAsync(100)
    expect(retryUser).not.toHaveBeenCalled()
  })
})
