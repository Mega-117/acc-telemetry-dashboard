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
    const retryTarget = vi.fn().mockResolvedValue(undefined)
    const onChange = vi.fn()
    const coordinator = createAuthSessionRecoveryCoordinator({
      getStatus: () => status,
      getRecoverableTarget: () => status === 'recoverable' ? user : null,
      retryTarget,
      getEventTarget: () => ({
        addEventListener: (type, listener) => listeners.set(type, listener),
      }),
      delaysMs: [10, 20],
      onChange,
    })
    return {
      coordinator,
      listeners,
      retryTarget,
      onChange,
      markReady: () => { status = 'ready' },
    }
  }

  it('segnala il backoff esaurito e Riprova lo riavvia da capo (PIP-550)', async () => {
    vi.useFakeTimers()
    const { coordinator, retryTarget, onChange } = setup()
    coordinator.schedule()
    expect(coordinator.isExhausted()).toBe(false)

    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(20)
    expect(retryTarget).toHaveBeenCalledTimes(2)
    expect(coordinator.isExhausted()).toBe(true)
    expect(onChange).toHaveBeenCalled()

    await coordinator.retryFromUser()
    expect(retryTarget).toHaveBeenCalledTimes(3)
    expect(coordinator.isExhausted()).toBe(false)
    await vi.advanceTimersByTimeAsync(10)
    expect(retryTarget).toHaveBeenCalledTimes(4)
  })

  it('Riprova non fa nulla quando la sessione non e recuperabile', async () => {
    const { coordinator, retryTarget, markReady } = setup()
    markReady()
    await coordinator.retryFromUser()
    expect(retryTarget).not.toHaveBeenCalled()
    expect(coordinator.isExhausted()).toBe(false)
  })

  it('ritenta con backoff bounded mentre lo stato resta recuperabile', async () => {
    vi.useFakeTimers()
    const { coordinator, retryTarget } = setup()
    coordinator.schedule()

    await vi.advanceTimersByTimeAsync(10)
    expect(retryTarget).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20)
    expect(retryTarget).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(retryTarget).toHaveBeenCalledTimes(2)
  })

  it('online e focus riarmano un retry immediato senza duplicare listener', async () => {
    const { coordinator, listeners, retryTarget } = setup()
    coordinator.installTriggers()
    coordinator.installTriggers()

    listeners.get('online')?.()
    await vi.waitFor(() => expect(retryTarget).toHaveBeenCalledTimes(1))
    listeners.get('focus')?.()
    await vi.waitFor(() => expect(retryTarget).toHaveBeenCalledTimes(2))
    expect(listeners.size).toBe(2)
  })

  it('cancella i retry quando la sessione torna pronta', async () => {
    vi.useFakeTimers()
    const { coordinator, retryTarget, markReady } = setup()
    coordinator.schedule()
    markReady()
    coordinator.clear()

    await vi.advanceTimersByTimeAsync(100)
    expect(retryTarget).not.toHaveBeenCalled()
  })
})
