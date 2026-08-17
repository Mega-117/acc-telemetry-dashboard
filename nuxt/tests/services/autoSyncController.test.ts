import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCloudOwnerLeaseController,
  setupAutoSyncController
} from '~/services/sync/autoSyncController'

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function makeWindow() {
  const events = new Map<string, () => void>()
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    addEventListener: (name: string, callback: () => void) => events.set(name, callback),
    removeEventListener: (name: string) => events.delete(name)
  })
  return events
}

describe('primary cloud owner auto-sync lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('avvia authReady una volta e inoltra eventi solo dopo il bootstrap', async () => {
    makeWindow()
    const callbacks = new Map<string, (...args: any[]) => void>()
    const unsubscribers = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    const electronAPI = {
      onFilesChanged: (callback: (...args: any[]) => void) => { callbacks.set('files', callback); return unsubscribers[0] },
      onWindowFocused: (callback: (...args: any[]) => void) => { callbacks.set('focus', callback); return unsubscribers[1] },
      onInitialFiles: (callback: (...args: any[]) => void) => { callbacks.set('initial', callback); return unsubscribers[2] },
      onRuntimeBootstrapCommand: (callback: (...args: any[]) => void) => { callbacks.set('command', callback); return unsubscribers[3] }
    }
    const leases = createCloudOwnerLeaseController()
    const lease = leases.start('uid-1')
    const handleTrigger = vi.fn(async () => {})
    const dispose = setupAutoSyncController({
      isElectron: true,
      electronAPI,
      lease,
      isLeaseCurrent: leases.isCurrent,
      handleTrigger
    })

    await settle()
    callbacks.get('files')?.({ new: [{ name: 'a' }], modified: [] })
    callbacks.get('command')?.({ schemaVersion: 1, type: 'manual-sync' })
    await settle()

    expect(handleTrigger.mock.calls.filter(([trigger]) => trigger === 'authReady')).toHaveLength(1)
    expect(handleTrigger).toHaveBeenCalledWith('filesChanged', expect.objectContaining({ uid: 'uid-1' }))
    expect(handleTrigger).toHaveBeenCalledWith('manualForceSync', { uid: 'uid-1' })

    dispose()
    callbacks.get('files')?.({ new: [{ name: 'stale' }], modified: [] })
    await settle()
    expect(unsubscribers.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
    expect(handleTrigger).not.toHaveBeenCalledWith('filesChanged', expect.objectContaining({ files: [{ name: 'stale' }] }))
  })

  it('limita i retry authReady e non duplica una richiesta in-flight', async () => {
    const events = makeWindow()
    const timers: Array<() => void> = []
    const leases = createCloudOwnerLeaseController()
    const lease = leases.start('uid-1')
    let recovered = false
    const handleTrigger = vi.fn(async () => {
      if (!recovered) throw new Error('offline')
    })

    setupAutoSyncController({
      isElectron: true,
      electronAPI: {},
      lease,
      isLeaseCurrent: leases.isCurrent,
      handleTrigger,
      maxAuthReadyAttempts: 3,
      maxAuthReadyTotalAttempts: 5,
      recoveryRetryDelayMs: 60_000,
      setTimeoutFn: ((callback: () => void) => { timers.push(callback); return timers.length }) as any,
      clearTimeoutFn: vi.fn() as any
    })

    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(1)
    timers.shift()?.()
    await settle()
    timers.shift()?.()
    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(3)
    expect(timers).toHaveLength(1)

    timers.shift()?.()
    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(4)
    expect(timers).toHaveLength(1)

    timers.shift()?.()
    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(5)
    expect(timers).toHaveLength(0)

    recovered = true
    events.get('online')?.()
    events.get('online')?.()
    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(6)
    expect(handleTrigger.mock.calls.filter(([trigger]) => trigger === 'authReady')).toHaveLength(6)
    expect(handleTrigger).toHaveBeenLastCalledWith('authReady', { uid: 'uid-1' })
    expect(timers).toHaveLength(0)

    events.get('online')?.()
    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(7)
    expect(handleTrigger).toHaveBeenLastCalledWith('windowFocused', { uid: 'uid-1' })
  })

  it('conserva i file cambiati arrivati durante authReady e li inoltra appena ready', async () => {
    makeWindow()
    const callbacks = new Map<string, (...args: any[]) => void>()
    let releaseAuthReady!: () => void
    const pendingAuthReady = new Promise<void>((resolve) => { releaseAuthReady = resolve })
    const handleTrigger = vi.fn(async (trigger: string) => {
      if (trigger === 'authReady') await pendingAuthReady
    })
    const leases = createCloudOwnerLeaseController()
    const lease = leases.start('uid-1')

    setupAutoSyncController({
      isElectron: true,
      electronAPI: {
        onFilesChanged: (callback) => { callbacks.set('files', callback) }
      },
      lease,
      isLeaseCurrent: leases.isCurrent,
      handleTrigger
    })

    await Promise.resolve()
    callbacks.get('files')?.({ new: [{ name: 'during-auth.json' }], modified: [] })
    expect(handleTrigger.mock.calls.map(([trigger]) => trigger)).toEqual(['authReady'])

    releaseAuthReady()
    await settle()
    expect(handleTrigger).toHaveBeenCalledWith('filesChanged', {
      uid: 'uid-1',
      files: [{ name: 'during-auth.json' }]
    })
  })

  it('riarma un budget bounded su focus dopo che il recovery automatico e esaurito', async () => {
    makeWindow()
    let onFocus: (() => void) | null = null
    let recovered = false
    const handleTrigger = vi.fn(async () => {
      if (!recovered) throw new Error('firestore unavailable')
    })
    const leases = createCloudOwnerLeaseController()
    const lease = leases.start('uid-1')

    setupAutoSyncController({
      isElectron: true,
      electronAPI: {
        onWindowFocused: (callback) => { onFocus = callback }
      },
      lease,
      isLeaseCurrent: leases.isCurrent,
      handleTrigger,
      maxAuthReadyAttempts: 1,
      maxAuthReadyTotalAttempts: 1
    })

    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(1)
    recovered = true
    onFocus?.()
    await settle()
    expect(handleTrigger).toHaveBeenCalledTimes(2)
  })

  it('non perde online se arriva mentre l ultimo tentativo e ancora in-flight', async () => {
    const events = makeWindow()
    let rejectFirst!: (error: Error) => void
    const pending = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    const handleTrigger = vi.fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(undefined)
    const leases = createCloudOwnerLeaseController()
    const lease = leases.start('uid-1')

    setupAutoSyncController({
      isElectron: true,
      electronAPI: {},
      lease,
      isLeaseCurrent: leases.isCurrent,
      handleTrigger,
      maxAuthReadyAttempts: 1,
      maxAuthReadyTotalAttempts: 1
    })

    await Promise.resolve()
    expect(handleTrigger).toHaveBeenCalledTimes(1)
    events.get('online')?.()
    rejectFirst(new Error('offline'))
    await settle()

    expect(handleTrigger).toHaveBeenCalledTimes(2)
    expect(handleTrigger.mock.calls.every(([trigger]) => trigger === 'authReady')).toBe(true)
  })

  it('invalida sincronicamente il lease precedente al cambio UID', () => {
    const leases = createCloudOwnerLeaseController()
    const first = leases.start('uid-a')
    expect(leases.isCurrent(first)).toBe(true)
    leases.revoke()
    expect(leases.isCurrent(first)).toBe(false)
    const second = leases.start('uid-b')
    expect(second.generation).toBeGreaterThan(first.generation)
    expect(leases.isCurrent(second)).toBe(true)
  })
})
