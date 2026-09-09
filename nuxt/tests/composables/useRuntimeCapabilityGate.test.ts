import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeCapabilityStore, useRuntimeCapabilityGate } from '~/composables/useRuntimeCapabilityGate'

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
  it('the primary waits for the canonical snapshot without calling protected IPC before login', () => {
    const api = {
      runtimeBootstrapRole: 'owner' as const,
      getRuntimeBootstrapState: vi.fn(),
      onRuntimeBootstrapState: vi.fn((callback: (value: typeof readySnapshot) => void) => {
        callback(readySnapshot)
        return () => {}
      }),
    }
    const store = createRuntimeCapabilityStore()
    const release = store.connect(api)
    expect(api.getRuntimeBootstrapState).not.toHaveBeenCalled()
    expect(store.gate('sync').value.allowed).toBe(true)
    release()
  })
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


describe('runtime bridge used by a hosted frontend', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the injected Electron API and releases the shared subscription', async () => {
    const unsubscribe = vi.fn()
    const api = {
      runtimeBootstrapRole: 'consumer' as const,
      getRuntimeBootstrapState: vi.fn().mockResolvedValue(readySnapshot),
      onRuntimeBootstrapState: vi.fn(() => unsubscribe),
    }
    vi.stubGlobal('window', { electronAPI: api })
    const runtime = useRuntimeCapabilityGate()
    const release = runtime.connect()
    try {
      await Promise.resolve()
      expect(runtime.source.value).toBe('electron')
      expect(runtime.gate('sync').value.allowed).toBe(true)
      expect(api.getRuntimeBootstrapState).toHaveBeenCalledOnce()
    } finally { release() }
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(runtime.snapshot.value).toBeNull()
  })

  it('clears a consumer snapshot when its initial bridge request fails', async () => {
    const store = createRuntimeCapabilityStore()
    const release = store.connect({
      runtimeBootstrapRole: 'consumer',
      getRuntimeBootstrapState: vi.fn().mockRejectedValue(new Error('IPC unavailable')),
      onRuntimeBootstrapState: callback => { callback(readySnapshot); return () => {} },
    })
    try {
      await Promise.resolve()
      await Promise.resolve()
      expect(store.source.value).toBe('electron')
      expect(store.snapshot.value).toBeNull()
      expect(store.gate('sync').value.allowed).toBe(false)
    } finally { release() }
  })

  it('loads as a browser consumer without requiring an Electron bridge', () => {
    vi.stubGlobal('window', {})
    const runtime = useRuntimeCapabilityGate()
    const release = runtime.connect()
    try { expect(runtime.source.value).toBe('browser') } finally { release() }
  })
})
