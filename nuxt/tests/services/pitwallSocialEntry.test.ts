import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPitwallSocialLifecycle } from '~/services/pitwall/pitwallSocialLifecycle'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'

function setup(disconnectedAt: number | null = null, failure?: string) {
  const records: Record<string, unknown> = {
    'rooms/r/slots': { '0': { uid: 'owner', reservedAt: 1 } },
    'rooms/r/occupancy': { owner: { c: { connectedAt: 1, disconnectedAt, nickname: 'owner' } } },
    'rooms/r/access': { owner: 'owner', guest: 'member' },
    'rooms/r/meta': { roomId: 'r', ownerUid: 'owner', label: 'test', createdAt: 1 },
  }
  const transact = vi.fn(async (_path: string, change: (v: unknown) => unknown) => {
    if (failure) throw new Error(failure)
    return { committed: change(null) != null }
  })
  const io = { read: async (p: string) => records[p] ?? null, transact,
    serverNow: () => 100000, serverTimestamp: () => 100000,
    registerDisconnectUpdates: async () => {}, write: async () => {} } as unknown as PitwallRealtimeTransport
  return { transact, service: createPitwallSocialLifecycle({ uid: 'guest', io,
    connectionId: () => 'guest-c', ensureConnection: async () => {}, watchFriends: () => () => {} }) }
}
describe('social room slot admission', () => {
  it('does not replace an old reservation of a connected member', async () => {
    const s=setup(); await s.service.joinRoom('r')
    expect(s.transact.mock.calls[0]?.[0]).toBe('rooms/r/slots/1')
  })
  it('keeps reconnecting members inside the grace period', async () => {
    const s=setup(90000); await s.service.joinRoom('r')
    expect(s.transact.mock.calls[0]?.[0]).toBe('rooms/r/slots/1')
  })
  it('reclaims an expired and absent member reservation', async () => {
    const s=setup(1); await s.service.joinRoom('r')
    expect(s.transact.mock.calls[0]?.[0]).toBe('rooms/r/slots/0')
  })
  it('preserves network failure instead of claiming the room is full', async () => {
    const s=setup(null,'network unavailable'); const result=await s.service.joinRoom('r')
    expect(result).toEqual({ok:false,reason:'network unavailable'})
    expect(s.transact).toHaveBeenCalledTimes(1)
  })
})

describe('social discovery presence gate', () => {
  afterEach(() => vi.useRealTimers())
  function discovery() {
    const callbacks = new Map<string, (value: unknown) => void>()
    const errors = new Map<string, (error: Error) => void>()
    const write = vi.fn(async () => {})
    const watch = vi.fn((path: string, callback: (value: unknown) => void, error: (error: Error) => void) => {
      callbacks.set(path, callback)
      errors.set(path, error)
      return () => { callbacks.delete(path) }
    })
    const service = createPitwallSocialLifecycle({ uid: 'guest',
      io: { watch, write, read: async () => ({ roomId: 'r', connectionId: 'guest-c' }), serverNow: () => 100000 } as unknown as PitwallRealtimeTransport,
      connectionId: () => 'guest-c', ensureConnection: async () => {},
      watchFriends: callback => { callback(['friend']); return () => {} }
    })
    const onError = vi.fn()
    const stop = service.watchRooms(() => {}, onError)
    return { callbacks, errors, onError, write, watch, stop, service }
  }
  it.each([
    ['permission-denied', 'preview', false],
    ['unavailable', 'preview', true],
    ['permission-denied', 'member', true],
    ['permission-denied', 'initial', true],
  ])('handles %s for %s without hiding actual faults', async (code, mode, reported) => {
    const s = discovery()
    s.callbacks.get('directory/friend')?.({ roomId: 'r', connectionId: 'c' })
    s.callbacks.get('connections/friend')?.({ c: {} })
    await vi.waitFor(() => expect(s.callbacks.has('rooms/r/meta')).toBe(true))
    if (mode !== 'initial') {
      s.callbacks.get('rooms/r/meta')?.({ roomId: 'r', hostUid: 'friend', label: 'test' })
      s.callbacks.get('rooms/r/access')?.({ friend: 'member', ...(mode === 'member' ? { guest: 'member' } : {}) })
      const present = { c: { connectedAt: 1, disconnectedAt: null } }
      s.callbacks.get('rooms/r/occupancy')?.({ friend: present, ...(mode === 'member' ? { guest: present } : {}) })
    }
    s.errors.get('rooms/r/meta')?.(Object.assign(new Error('denied'), { code }))
    expect(s.onError).toHaveBeenCalledTimes(reported ? 1 : 0)
    expect(s.callbacks.has('rooms/r/occupancy')).toBe(false)
    expect(s.write).toHaveBeenCalledOnce()
    s.stop()
  })
  it('does not request admissions or room metadata for stale own/friend directories', async () => {
    const s = discovery()
    for (const uid of ['guest', 'friend']) {
      s.callbacks.get(`directory/${uid}`)?.({ roomId: 'old', connectionId: 'gone' })
      s.callbacks.get(`connections/${uid}`)?.(null)
    }
    await Promise.resolve(); await Promise.resolve()
    expect(s.write).not.toHaveBeenCalled()
    expect(s.watch.mock.calls.some(([path]) => path.startsWith('rooms/'))).toBe(false)
    s.stop(); expect(s.callbacks.size).toBe(0)
  })
  it('discovers a friend arriving after the directory and serializes concurrent signals', async () => {
    const s = discovery()
    s.callbacks.get('directory/friend')?.({ roomId: 'r', connectionId: 'c' })
    s.callbacks.get('connections/friend')?.(null)
    await Promise.resolve(); await Promise.resolve()
    expect(s.write).not.toHaveBeenCalled()
    s.callbacks.get('connections/friend')?.({ c: {} })
    s.callbacks.get('connections/friend')?.({ c: {} })
    await vi.waitFor(() => expect(s.callbacks.has('rooms/r/meta')).toBe(true))
    expect(s.write).toHaveBeenCalledOnce()
    s.stop()
  })
  it('retries transient occupancy races with a bound and cancels retries on exit', async () => {
    vi.useFakeTimers()
    const s = discovery()
    s.write.mockRejectedValue(new Error('PERMISSION_DENIED'))
    s.callbacks.get('directory/friend')?.({ roomId: 'r', connectionId: 'c' })
    s.callbacks.get('connections/friend')?.({ c: {} })
    await vi.advanceTimersByTimeAsync(10000)
    expect(s.write).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(60000)
    expect(s.write).toHaveBeenCalledTimes(4)
    s.callbacks.get('connections/friend')?.({ c: {} })
    await vi.advanceTimersByTimeAsync(1)
    expect(s.write).toHaveBeenCalledTimes(5)
    s.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(s.write).toHaveBeenCalledTimes(5)
  })
  it('keeps a live sponsor subscription when own membership appears and removes it before leave writes', async () => {
    const s = discovery()
    s.callbacks.get('directory/friend')?.({ roomId: 'r', connectionId: 'c' })
    s.callbacks.get('connections/friend')?.({ c: {} })
    await vi.waitFor(() => expect(s.callbacks.has('rooms/r/meta')).toBe(true))
    const subscribed = s.watch.mock.calls.length
    s.callbacks.get('directory/guest')?.({ roomId: 'r', connectionId: 'guest-c' })
    s.callbacks.get('connections/guest')?.({ 'guest-c': {} })
    await Promise.resolve(); await Promise.resolve()
    expect(s.write).toHaveBeenCalledOnce()
    expect(s.watch.mock.calls.length).toBe(subscribed + 1) // only the guest connection
    s.write.mockImplementationOnce(async () => {
      expect(s.callbacks.has('rooms/r/meta')).toBe(false)
      expect(s.callbacks.has('rooms/r/access')).toBe(false)
      expect(s.callbacks.has('rooms/r/occupancy')).toBe(false)
      s.callbacks.get('directory/guest')?.(null)
    })
    expect((await s.service.leaveRoom('r')).ok).toBe(true)
    // A present friend still makes the room discoverable after explicit exit.
    await vi.waitFor(() => expect(s.callbacks.has('rooms/r/meta')).toBe(true))
    s.stop()
  })
})
