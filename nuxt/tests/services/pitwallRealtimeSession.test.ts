import { describe, it, expect, vi } from 'vitest'
import { createPitwallRealtimeSession } from '~/services/pitwall/pitwallRealtimeSession'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
vi.mock('~/config/pitwallRealtime', () => ({ getPitwallRealtime: vi.fn() }))
import { createPitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'

function fixture() {
  let online = true
  let changed = (_online: boolean) => {}
  const sequence: string[] = []
  const io = {
    online: () => online,
    onConnection: (callback: typeof changed) => { changed = callback; callback(online); return vi.fn() },
    registerDisconnectUpdates: vi.fn(async () => { sequence.push('disconnect registered'); return vi.fn() }),
    serverTimestamp: () => ({ '.sv': 'timestamp' }),
    write: vi.fn(async () => { sequence.push('write') }),
  }
  const session = createPitwallRealtimeSession(io as unknown as PitwallRealtimeTransport, 'driver')
  const state = { runtimeSessionId: 'runtime', roomId: 'room', nickname: 'Driver', kind: 'driver' as const, driving: true, sourceValid: true }
  return { io, session, state, sequence, connect: (value: boolean) => { online = value; changed(value) } }
}

describe('event-driven RTDB presence', () => {
  it('does not let an idle desktop driver erase engineer membership; restores it after driving', async () => {
    const f = fixture()
    const service = createPitwallRealtimeRoomService({ uid: 'engineer', io: f.io as unknown as PitwallRealtimeTransport })
    const driver = { nickname: 'Driver', kind: 'driver' as const, driving: false, runtimeSessionId: 'desktop' }
    const engineer = { nickname: 'Engineer', kind: 'engineer' as const, driving: false, runtimeSessionId: 'page' }
    await service.publishPresence(null, driver)
    expect((await service.publishPresence('remote', engineer)).ok).toBe(true)
    expect(service.session.isReady('remote')).toBe(true)
    await service.publishPresence(null, driver)
    expect(service.session.isReady('remote')).toBe(true)
    await service.publishPresence('own', { ...driver, driving: true, strategy: {} })
    expect(service.session.isReady('own')).toBe(true)
    await service.publishPresence('remote', engineer)
    expect(service.session.isReady('own')).toBe(true)
    await service.deactivateDriver()
    expect(service.session.isReady('remote')).toBe(true)
    await service.clearEngineerPresence('remote')
    expect(service.session.isReady('remote')).toBe(false)
    await service.dispose(); await f.session.stop()
  })
  it('reports publication failures and never declares unacknowledged membership ready', async () => {
    const f = fixture()
    f.io.write.mockRejectedValueOnce(new Error('permission denied'))
    await expect(f.session.update(f.state)).rejects.toThrow('permission denied')
    expect(f.session.isReady('room')).toBe(false)
    await f.session.update(f.state)
    expect(f.session.isReady('room')).toBe(true)
    f.connect(false)
    expect(f.session.isReady('room')).toBe(false)
    await f.session.stop()
  })
  it('registers disconnect before publishing and writes only state changes', async () => {
    const f = fixture()
    await f.session.update(f.state)
    expect(f.sequence).toEqual(['disconnect registered', 'write'])
    for (let i = 0; i < 240; i++) await f.session.update({ ...f.state })
    expect(f.io.write).toHaveBeenCalledTimes(1)
    await f.session.update({ ...f.state, driving: false })
    expect(f.io.write).toHaveBeenCalledTimes(2)
    await f.session.stop()
  })
  it('changes connection identity after reconnect, publishing current desired state once', async () => {
    const f = fixture()
    await f.session.update(f.state)
    const previous = f.session.connectionId()
    f.connect(false)
    await f.session.update({ ...f.state, driving: false })
    expect(f.io.write).toHaveBeenCalledTimes(1)
    f.connect(true)
    await f.session.update({ ...f.state, driving: false })
    expect(f.session.connectionId()).not.toBe(previous)
    expect(f.io.write).toHaveBeenCalledTimes(2)
    await f.session.stop()
  })
  it('removes a presence whose acknowledgement races with stop', async () => {
    const f = fixture()
    let acknowledge!: () => void
    f.io.write.mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve }))
    const publication = f.session.update(f.state)
    await vi.waitFor(() => expect(f.io.write).toHaveBeenCalledTimes(1))
    const connection = f.session.connectionId()
    const stopping = f.session.stop()
    acknowledge()
    await Promise.all([publication, stopping])
    expect(f.io.write).toHaveBeenLastCalledWith('', {
      [`connections/driver/${connection}`]: null,
      [`rooms/room/presence/driver/${connection}`]: null,
    })
  })
})

// PIP-593: two live devices D and B of the same account in one social room; B published last.
describe('directory failover between devices of one account', () => {
  function socialFixture() {
    const watchers = new Map<string, (value: unknown) => void>()
    const stops: string[] = []
    let directory: { roomId: string, connectionId: string, slot: string } = { roomId: 'room', connectionId: 'B', slot: 's1' }
    const io = {
      namespace: 'pitwallRoomsV1',
      online: () => true,
      onConnection: (callback: (online: boolean) => void) => { callback(true); return vi.fn() },
      registerDisconnectUpdates: vi.fn(async () => vi.fn()),
      serverTimestamp: () => ({ '.sv': 'timestamp' }),
      read: vi.fn(async () => directory),
      write: vi.fn(async (_root: string, changes: Record<string, unknown>) => {
        const pointer = changes['directory/driver'] as typeof directory | undefined
        if (pointer) directory = pointer
      }),
      watch: vi.fn((path: string, callback: (value: unknown) => void, error: (cause: unknown) => void) => {
        watchers.set(path, callback); failures.set(path, error); return () => stops.push(path)
      }),
    }
    const failures = new Map<string, (cause: unknown) => void>()
    const session = createPitwallRealtimeSession(io as unknown as PitwallRealtimeTransport, 'driver')
    const state = { runtimeSessionId: 'runtime', roomId: 'room', nickname: 'Driver', kind: 'engineer' as const, driving: false, sourceValid: false }
    const emit = (path: string, value: unknown) => watchers.get(path)?.(value)
    const cancel = (path: string) => failures.get(path)?.(new Error('permission_denied'))
    return { io, session, state, emit, cancel, stops, pointer: () => directory }
  }

  it('takes the pointer back only when the device it names is gone', async () => {
    const f = socialFixture()
    await f.session.update(f.state)
    const mine = f.session.connectionId()
    expect(f.pointer().connectionId).toBe(mine)
    expect(f.io.watch).toHaveBeenCalledTimes(2)
    // B publishes again and owns the pointer while it is alive: D leaves it alone.
    f.emit('directory/driver', { roomId: 'room', connectionId: 'B', slot: 's1' })
    f.emit('connections/driver', { B: {}, [mine]: {} })
    await Promise.resolve()
    expect(f.io.write).toHaveBeenCalledTimes(1)
    // B closes: its connection disappears and D writes only the directory, pointing it at its own occupancy
    // (no full republication: that would need the departed device's authority).
    f.emit('connections/driver', { [mine]: {} })
    await vi.waitFor(() => expect(f.io.write).toHaveBeenCalledTimes(2))
    expect(f.io.write.mock.calls[1]![1]).toEqual({ 'directory/driver': { roomId: 'room', slot: 's1', connectionId: mine } })
    expect(f.io.registerDisconnectUpdates).toHaveBeenCalledTimes(1)
    expect(f.session.isReady('room')).toBe(true)
    // A pointer for another room is not this session's to take.
    f.emit('directory/driver', { roomId: 'other', connectionId: 'X', slot: 's2' })
    await Promise.resolve()
    expect(f.io.write).toHaveBeenCalledTimes(2)
    await f.session.stop()
    expect(f.stops.sort()).toEqual(['connections/driver', 'directory/driver'])
  })

  it('a cancelled listener is subscribed again by the next publication; leaving the room stops listening', async () => {
    const f = socialFixture()
    await f.session.update(f.state)
    expect(f.io.watch).toHaveBeenCalledTimes(2)
    f.cancel('connections/driver')
    expect(f.stops.sort()).toEqual(['connections/driver', 'directory/driver'])
    await f.session.update({ ...f.state, driving: true })
    expect(f.io.watch).toHaveBeenCalledTimes(4)
    await f.session.update({ ...f.state, roomId: null })
    expect(f.stops).toHaveLength(4)
    await f.session.stop()
  })
})
