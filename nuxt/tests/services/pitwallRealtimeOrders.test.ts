import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPitwallRealtimeOrders, boundMfdPerformance } from '~/services/pitwall/pitwallRealtimeOrders'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import type { PitwallRealtimeSession } from '~/services/pitwall/pitwallRealtimeSession'
import { createPitwallRoomOutcomeRecovery } from '~/services/pitwall/pitwallRoomOutcomeRecovery'

afterEach(() => vi.useRealTimers())

it('recovers diagnostics from the durable outcome without applying again', async () => {
  const performance = { version: 1, correctionPasses: 1, counts: { ocr: 12 } }
  const publishOutcome = vi.fn(async () => ({ ok: true as const, value: true as const }))
  const confirm = vi.fn(async () => 1)
  const recovery = createPitwallRoomOutcomeRecovery({ uid: 'driver', isStopped: () => false, log: console,
    rooms: { publishOutcome, readOrder: vi.fn() }, electronApi: {
      pitwallPendingOutcomes: async () => [{ method: 'mfd-v4', orderId: 'order', roomId: 'room', driverUid: 'driver', status: 'applied', reason: null, fields: {}, appliedAt: '2026-10-09', performance }],
      pitwallConfirmOutcomes: confirm,
    } })
  await recovery.drainPendingOutcomes()
  expect(publishOutcome).toHaveBeenCalledWith('room', 'order', expect.objectContaining({ performance }))
  expect(confirm).toHaveBeenCalledWith(['order'])
})

it('preserves bounded optional V4 diagnostics when publishing the result', async () => {
  const performance = { version: 1, correctionPasses: 1, counts: { captures: 5, ocr: 8 }, corrections: [{ field: 'FL', before: 24, after: 26 }] }
  expect(boundMfdPerformance(performance)).toEqual(performance)
  expect(boundMfdPerformance({ version: 1, extra: 'x'.repeat(4096) })).toBeNull()
  expect(boundMfdPerformance({ version: 2 })).toBeNull()
  const write = vi.fn()
  const io = { namespace: 'pitwallRoomsV1', serverNow: () => 1000, write,
    read: vi.fn(async (path: string) => path.endsWith('/claim') ? null : { status: 'applying', claimedBy: 'driver', targetConnectionId: 'dc' }) }
  const orders = createPitwallRealtimeOrders({ io: io as unknown as PitwallRealtimeTransport,
    session: { uid: 'driver' } as unknown as PitwallRealtimeSession, connections: () => [] })
  expect((await orders.publishOutcome('room', 'order', { status: 'applied', method: 'mfd-v4', performance })).ok).toBe(true)
  expect(write.mock.calls[0]![1]['orders/order'].result.performance).toEqual(performance)
})
describe('concurrent send diagnosis', () => {
  it.each(['active', 'expired', 'other-driver', 'unreadable'])('only explains a confirmed active target lease: %s', async state => {
    const denied = new Error('PERMISSION_DENIED: Permission denied')
    const write = vi.fn().mockRejectedValue(denied)
    const read = vi.fn(async (path: string) => {
      if (path.includes('/mfd/')) return null // Legacy Standard peer.
      if (state === 'unreadable') throw denied
      return { uid: state === 'other-driver' ? 'someone-else' : 'driver', connectionId: 'dc', orderId: 'first',
        leaseUntilMs: state === 'expired' ? 900 : 2000 }
    })
    const io = { namespace: 'pitwallRoomsV1', online: () => true, serverNow: () => 1000, read, write }
    const orders = createPitwallRealtimeOrders({ io: io as unknown as PitwallRealtimeTransport,
      session: { uid: 'engineer', isReady: () => true, connectionId: () => 'ec' } as unknown as PitwallRealtimeSession,
      connections: () => [{ protocolVersion: 3, uid: 'driver', connectionId: 'dc', runtimeSessionId: 'runtime',
        roomId: 'room', nickname: 'Driver', kind: 'driver', driving: true, sourceValid: true, updatedAt: 1000 }] })
    const result = await orders.sendOrder('room', { orderId: 'second', revision: 1, plan: { fuelToAdd: 15 }, targetUid: 'driver' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(state === 'active'
      ? 'Il pilota sta applicando un’altra strategia. Attendi l’esito, poi invia di nuovo manualmente.' : denied.message)
    expect(write).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledWith('rooms/room/control/driver/claim')
  })
})

describe('declared simulator command capabilities', () => {
  it.each(['unsupported', 'reconnected', 'available'])('checks Standard before publishing: %s', async mode => {
    let connectionId = 'dc'
    const write = vi.fn()
    const read = vi.fn(async () => {
      if (mode === 'reconnected') connectionId = 'new'
      return { uid: 'driver', connectionId: 'dc', strategy: { applicationMethods: mode === 'unsupported' ? [] : ['standard'] } }
    })
    const io = { namespace: 'pitwallRoomsV1', online: () => true, serverNow: () => 1000, read, write }
    const orders = createPitwallRealtimeOrders({ io: io as unknown as PitwallRealtimeTransport,
      session: { uid: 'engineer', isReady: () => true, connectionId: () => 'ec' } as unknown as PitwallRealtimeSession,
      connections: () => [{ protocolVersion: 3, uid: 'driver', connectionId, runtimeSessionId: 'runtime',
        roomId: 'room', nickname: 'Driver', kind: 'driver', driving: true, sourceValid: true, updatedAt: 1000 }] })
    const result = await orders.sendOrder('room', { orderId: 'command', revision: 1, plan: { fuelToAdd: 15 }, targetUid: 'driver' })
    expect(result.ok).toBe(mode === 'available')
    expect(write).toHaveBeenCalledTimes(mode === 'available' ? 1 : 0)
  })
})
describe('order confirmation deadline', () => {
  it.each(['pending', 'applying'])('reports unavailable confirmation for %s and still receives a recovered result', status => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    let receive!: (value: unknown) => void
    const unsubscribe = vi.fn()
    const io = { serverNow: () => Date.now(), watch: (_: string, cb: typeof receive) => { receive = cb; return unsubscribe } }
    const orders = createPitwallRealtimeOrders({ io: io as unknown as PitwallRealtimeTransport,
      session: { uid: 'A' } as PitwallRealtimeSession, connections: () => [] })
    const callback = vi.fn()
    const stop = orders.watchOrder('room', 'order', callback)
    const order = { status, expiresAtMs: 3000, leaseUntilMs: 2000 }
    receive(order)
    expect(callback).toHaveBeenLastCalledWith(order)
    vi.advanceTimersByTime(status === 'applying' ? 1001 : 2001)
    expect(callback).toHaveBeenLastCalledWith(null)
    receive({ ...order, status: 'partial', result: { fields: { fuel: 'verified' } } })
    expect(callback.mock.lastCall?.[0].status).toBe('partial')
    stop(); expect(unsubscribe).toHaveBeenCalledOnce()
    const count = callback.mock.calls.length
    vi.advanceTimersByTime(10000)
    expect(callback).toHaveBeenCalledTimes(count)
  })
})
