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
