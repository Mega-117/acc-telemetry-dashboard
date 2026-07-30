import { describe, expect, it, vi } from 'vitest'
import { createRuntimeCapabilityStore } from '~/composables/useRuntimeCapabilityGate'

const readySnapshot = {
  schemaVersion: 1 as const,
  lifecycle: 'ready' as const,
  phase: 'ready',
  capabilities: {
    sync: { state: 'allowed', reason: 'healthy' }
  },
  reasonCode: null,
  lastEvent: null
}

describe('useRuntimeCapabilityGate store', () => {
  it('condivide una sola subscription e la pulisce all’ultimo consumer', async () => {
    let listener: ((value: typeof readySnapshot) => void) | null = null
    const unsubscribe = vi.fn()
    const api = {
      runtimeBootstrapRole: 'consumer' as const,
      getRuntimeBootstrapState: vi.fn().mockResolvedValue(readySnapshot),
      onRuntimeBootstrapState: vi.fn((callback: (value: typeof readySnapshot) => void) => {
        listener = callback
        return unsubscribe
      })
    }
    const store = createRuntimeCapabilityStore()
    const releaseA = store.connect(api)
    const releaseB = store.connect(api)
    await Promise.resolve()

    expect(api.getRuntimeBootstrapState).toHaveBeenCalledTimes(1)
    expect(api.onRuntimeBootstrapState).toHaveBeenCalledTimes(1)
    expect(store.gate('sync').value.allowed).toBe(true)

    listener?.({
      ...readySnapshot,
      capabilities: { sync: { state: 'pending', reason: 'offline_cloud_pending' } }
    })
    expect(store.gate('sync').value.allowed).toBe(false)

    releaseA()
    expect(unsubscribe).not.toHaveBeenCalled()
    releaseB()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
