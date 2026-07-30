import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupAutoSyncController } from '~/services/sync/autoSyncController'

describe('autoSyncController bootstrap resume', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ritenta authReady alla riconnessione senza duplicare sorgenti auth', async () => {
    let intervalCallback: (() => Promise<void>) | null = null
    let onlineCallback: (() => Promise<void>) | null = null
    vi.stubGlobal('window', {
      setInterval: (callback: () => Promise<void>) => { intervalCallback = callback; return 1 },
      clearInterval: vi.fn(),
      addEventListener: (name: string, callback: () => Promise<void>) => {
        if (name === 'online') onlineCallback = callback
      }
    })
    const handleTrigger = vi.fn(async () => {})
    const currentUser = { value: { uid: 'uid-1', emailVerified: true } }

    setupAutoSyncController({
      isElectron: true,
      electronAPI: {},
      currentUser,
      handleTrigger
    })

    await intervalCallback?.()
    await onlineCallback?.()
    expect(handleTrigger).toHaveBeenNthCalledWith(1, 'authReady', { uid: 'uid-1' })
    expect(handleTrigger).toHaveBeenNthCalledWith(2, 'authReady', { uid: 'uid-1' })
  })
})
