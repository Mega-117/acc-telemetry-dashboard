import { describe, it, expect, vi } from 'vitest'
import { createPitwallRealtimeSession } from '~/services/pitwall/pitwallRealtimeSession'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'

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
