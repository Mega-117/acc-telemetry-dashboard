import { describe, expect, it, vi } from 'vitest'

// PIP-660: the transport says when nothing uses the connection, and wakes it before any use.
const listeners = new Map<string, (snap: { val: () => unknown }) => void>()
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, cb: (snap: { val: () => unknown }) => void) => { listeners.set(path, cb); if (path === '.info/connected') cb({ val: () => true }); return () => listeners.delete(path) },
  get: async () => ({ val: () => ({ a: 1 }) }),
  update: async () => {},
  runTransaction: async () => ({ committed: true, snapshot: { val: () => null, exists: () => false } }),
  onDisconnect: () => ({ remove: async () => {}, update: async () => {}, cancel: async () => {} }),
  serverTimestamp: () => ({}),
}))

const { createPitwallRealtimeTransport, pitwallRealtimeDatabaseIdle, setPitwallRealtimeWake, waitPitwallRealtimeConnected } = await import('~/services/pitwall/pitwallRealtimeTransport')

describe('pitwall realtime idle (PIP-660)', () => {
  it('is idle with nothing going on; listeners, work and disconnect registrations pin it', async () => {
    const db = {} as never
    const wake = vi.fn(async () => {})
    setPitwallRealtimeWake(db, wake)
    const main = createPitwallRealtimeTransport(db)
    const social = createPitwallRealtimeTransport(db, 'social')
    expect(pitwallRealtimeDatabaseIdle(db)).toBe(true)
    const stop = social.watch('rooms/x', () => {})
    expect(pitwallRealtimeDatabaseIdle(db)).toBe(false)
    stop()
    expect(pitwallRealtimeDatabaseIdle(db)).toBe(true)
    await main.read('grants/u1')
    await main.write('a', { b: 1 })
    expect(wake).toHaveBeenCalled()
    const cancel = await main.registerDisconnect('connections/u1/c1')
    expect(pitwallRealtimeDatabaseIdle(db)).toBe(false)
    await cancel()
    expect(pitwallRealtimeDatabaseIdle(db)).toBe(true)
    main.dispose(); social.dispose()
  })

  it('a read refused while offline does not stay listed as running (it would pin the connection)', async () => {
    const db = {} as never
    const io = createPitwallRealtimeTransport(db)
    listeners.get('.info/connected')?.({ val: () => false })
    await expect(io.read('grants/u3')).rejects.toThrow(/non disponibile/)
    expect(pitwallRealtimeDatabaseIdle(db)).toBe(true)
    io.dispose()
  })

  it('a read waits for the wake (the connection reopening) before going out', async () => {
    const db = {} as never
    const order: string[] = []
    setPitwallRealtimeWake(db, async () => { order.push('wake') })
    const io = createPitwallRealtimeTransport(db)
    await io.read('grants/u2').then(() => order.push('read'))
    expect(order).toEqual(['wake', 'read'])
    io.dispose()
  })

  it('the wake waits for .info/connected through the transport (the only Realtime Database owner)', async () => {
    await expect(waitPitwallRealtimeConnected({} as never, 50)).resolves.toBeUndefined()
  })
})
