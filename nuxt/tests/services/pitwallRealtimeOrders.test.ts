import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPitwallRealtimeOrders } from '~/services/pitwall/pitwallRealtimeOrders'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import type { PitwallRealtimeSession } from '~/services/pitwall/pitwallRealtimeSession'

afterEach(() => vi.useRealTimers())
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
