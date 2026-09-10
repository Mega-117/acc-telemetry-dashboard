import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPitwallRealtimeOrders } from '~/services/pitwall/pitwallRealtimeOrders'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import type { PitwallRealtimeSession } from '~/services/pitwall/pitwallRealtimeSession'

afterEach(() => vi.useRealTimers())
describe('concurrent send diagnosis', () => {
  it.each(['active', 'expired', 'other-driver', 'unreadable'])('only explains a confirmed active target lease: %s', async state => {
    const denied = new Error('PERMISSION_DENIED: Permission denied')
    const write = vi.fn().mockRejectedValue(denied)
    const read = vi.fn(async () => {
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
