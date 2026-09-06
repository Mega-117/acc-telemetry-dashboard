import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
const profile = vi.hoisted(() => ({ change: null as null | (() => void), read: vi.fn(async (uid: string) => `Name ${uid}`), stop: vi.fn() }))
vi.mock('~/config/pitwallRealtime', () => ({ getPitwallRealtime: vi.fn() }))
vi.mock('~/services/pitwall/pitwallProfileCache', () => ({ createPitwallProfileCache: () => ({ read: profile.read, stop: profile.stop, onChange: (cb: () => void) => { profile.change = cb; return () => { profile.change = null } } }) }))
vi.mock('~/services/pitwall/pitwallEngineerService', () => ({ createPitwallEngineerService: () => ({ searchUsers: vi.fn(async () => []) }) }))
import { createPitwallRealtimeEngineerService } from '~/services/pitwall/pitwallRealtimeEngineerService'

function setup() {
  let online = true
  const callbacks = new Map<string, Set<(value: unknown) => void>>()
  const connections = new Set<(online: boolean) => void>()
  const values = new Map<string, unknown>()
  const io = { serverNow: () => Date.now(), online: () => online,
    read: vi.fn(async (path: string) => values.get(path) ?? null), write: vi.fn(async () => {}),
    watch: vi.fn((path: string, cb: (value: unknown) => void) => {
      if (!callbacks.has(path)) callbacks.set(path, new Set())
      callbacks.get(path)!.add(cb)
      return () => { callbacks.get(path)!.delete(cb) }
    }),
    onConnection(cb: (online: boolean) => void) { connections.add(cb); cb(online); return () => connections.delete(cb) },
  }
  const service = createPitwallRealtimeEngineerService({ db: {} as Firestore, engineerUid: 'me', io: io as unknown as PitwallRealtimeTransport })
  return { io, service, values, callbacks, emit(path: string, value: unknown) { values.set(path, value); for (const cb of callbacks.get(path) ?? []) cb(value) },
    connect(value: boolean) { online = value; for (const cb of connections) cb(value) } }
}
const grant = (driverUid = 'driver', engineerUid = 'me') => ({ schemaVersion: 1, driverUid, engineerUid, status: 'granted', scope: 'always', createdBy: driverUid, createdAt: '2026-09-06', updatedAt: '2026-09-06' })
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('RTDB engineer relationships and event-only discovery', () => {
  it.each(['watchOutgoingLinks', 'watchIncomingRequests'] as const)('does not report empty data before the first RTDB snapshot: %s', async (method) => {
    const h = setup(); const changed = vi.fn()
    const stop = h.service[method](changed)
    profile.change?.()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(changed).not.toHaveBeenCalled()
    h.emit(method === 'watchOutgoingLinks' ? 'outgoing/me' : 'grants/me', {})
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([]))
    stop(); h.service.dispose()
  })
  it('waits for every initial grant and reuses subscriptions when profile names change', async () => {
    const h = setup(); const changed = vi.fn()
    const stop = h.service.watchOutgoingLinks(changed)
    h.emit('outgoing/me', { driver: true, second: true })
    h.emit('grants/driver/me', grant())
    await Promise.resolve(); expect(changed).not.toHaveBeenCalled()
    h.emit('grants/second/me', grant('second'))
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
    expect(changed.mock.calls[0]![0]).toHaveLength(2)
    const count = h.io.watch.mock.calls.length
    profile.change?.()
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2))
    expect(h.io.watch).toHaveBeenCalledTimes(count)
    expect(h.io.read).not.toHaveBeenCalled()
    h.emit('outgoing/me', { driver: true })
    await vi.waitFor(() => expect(changed.mock.lastCall![0]).toHaveLength(1))
    stop(); h.service.dispose()
    expect([...h.callbacks.values()].every(set => set.size === 0)).toBe(true)
  })
  it('uses local expiry events without database reads or writes', async () => {
    vi.useFakeTimers(); const h = setup(); const changed = vi.fn()
    const stop = h.service.watchGrantedPilots(changed)
    h.emit('outgoing/me', { driver: true })
    h.emit('grants/driver/me', { ...grant(), scope: 'once', expiresAtMs: Date.now() + 2000 })
    expect(changed).toHaveBeenLastCalledWith(['driver'])
    await vi.advanceTimersByTimeAsync(2001)
    expect(changed).toHaveBeenLastCalledWith([])
    expect(h.io.read).not.toHaveBeenCalled(); expect(h.io.write).not.toHaveBeenCalled()
    stop(); h.service.dispose()
  })
  it('requires mutual grants and handles incoming and outgoing changes', async () => {
    const h = setup(); const trusted = vi.fn(); const incoming = vi.fn()
    const stop = h.service.watchTrustedUids(trusted)
    const stopIncoming = h.service.watchIncomingRequests(incoming)
    h.emit('grants/me', { driver: grant('me', 'driver') })
    h.emit('outgoing/me', { driver: true }); expect(trusted).not.toHaveBeenCalled()
    h.emit('grants/driver/me', grant())
    expect(trusted).toHaveBeenLastCalledWith(['driver'])
    await vi.waitFor(() => expect(incoming).toHaveBeenCalled())
    h.emit('grants/me', {})
    expect(trusted).toHaveBeenLastCalledWith([])
    stop(); stopIncoming(); h.service.dispose()
  })
  it('requests and updates permissions only for explicit actions, returns errors without retry', async () => {
    const h = setup()
    expect((await h.service.requestLink('driver')).ok).toBe(true)
    expect(h.io.write).toHaveBeenCalledTimes(1)
    h.values.set('grants/driver/me', grant())
    expect(await h.service.requestLink('driver')).toEqual({ ok: true, alreadyGranted: true })
    expect(h.io.write).toHaveBeenCalledTimes(1)
    expect((await h.service.withdraw('driver')).ok).toBe(true)
    expect((await h.service.preAuthorise('driver', 'once')).ok).toBe(true)
    expect((await h.service.decideRequest('driver', 'granted', 'always')).ok).toBe(true)
    expect((await h.service.decideRequest('driver', 'revoked')).ok).toBe(true)
    expect((await h.service.updateGrantExpiry('driver', Date.now() - 1)).ok).toBe(false)
    expect((await h.service.updateGrantExpiry('driver', Date.now() + 5000)).ok).toBe(true)
    h.io.write.mockRejectedValueOnce(new Error('quota'))
    expect(await h.service.withdraw('driver')).toEqual({ ok: false, reason: 'quota' })
    expect((await h.service.sendOrder({})).ok).toBe(false)
    const order = vi.fn(); h.service.watchOrder('driver', 'old', order)(); expect(order).toHaveBeenCalledWith(null)
    h.service.dispose()
  })
  it('restores unchanged driver presence on reconnect and reads explicit lists', async () => {
    const h = setup(); const changed = vi.fn()
    const stop = h.service.watchPilotPresence('driver', changed)
    const connection = { protocolVersion: 3, uid: 'driver', connectionId: 'c', runtimeSessionId: 'r', nickname: 'Driver', kind: 'driver', driving: true, sourceValid: true, roomId: 'room', updatedAt: Date.now() }
    h.emit('connections/driver', { c: connection })
    expect(changed.mock.lastCall![0].reachable).toBe(true)
    h.connect(false); expect(changed.mock.lastCall![0].reachable).toBe(false)
    h.connect(true); expect(changed.mock.lastCall![0].session.roomId).toBe('room')
    h.values.set('outgoing/me', { driver: true }); h.values.set('grants/driver/me', grant()); h.values.set('grants/me', { driver: grant('me', 'driver') })
    expect(await h.service.listOutgoingLinks()).toHaveLength(1)
    expect(await h.service.listIncomingRequests()).toHaveLength(1)
    expect(await h.service.listLinkedPilots()).toHaveLength(1)
    h.io.read.mockRejectedValueOnce(new Error('offline'))
    expect(await h.service.readPilotPresence('driver')).toEqual({ session: null, reachable: false })
    stop(); h.service.dispose()
  })
})
