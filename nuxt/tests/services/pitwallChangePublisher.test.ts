import { afterEach, describe, it, expect, vi } from 'vitest'
import { createPitwallChangePublisher } from '~/services/pitwall/pitwallChangePublisher'

afterEach(() => { vi.useRealTimers() })
describe('MFD change publication', () => {
  it('coalesces a multi-field action and publishes no identical state for two hours', async () => {
    vi.useFakeTimers()
    const publish = vi.fn().mockResolvedValue(undefined)
    const p = createPitwallChangePublisher(publish, vi.fn())
    p.offer({ fuel: 20, set: 2 }); p.offer({ fuel: 25, set: 3 })
    await vi.advanceTimersByTimeAsync(100)
    expect(publish).toHaveBeenCalledExactlyOnceWith({ fuel: 25, set: 3 })
    for (let i = 0; i < 240; i++) {
      p.offer({ set: 3, fuel: 25 }); await vi.advanceTimersByTimeAsync(30_000)
    }
    expect(publish).toHaveBeenCalledTimes(1)
    p.stop()
  })
  it('does not retry failed writes periodically; new connection can send its snapshot', async () => {
    vi.useFakeTimers()
    const publish = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const error = vi.fn()
    const p = createPitwallChangePublisher(publish, error)
    p.offer(1); await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(7_200_000)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    p.reset(); p.offer(1); await vi.advanceTimersByTimeAsync(100)
    expect(publish).toHaveBeenCalledTimes(2)
    p.stop(); p.offer(2); await vi.advanceTimersByTimeAsync(100)
    expect(publish).toHaveBeenCalledTimes(2)
  })
  it('serializes publications and retains the latest change while a write is pending', async () => {
    vi.useFakeTimers()
    let done!: () => void
    const publish = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve })).mockResolvedValue(undefined)
    const p = createPitwallChangePublisher(publish, vi.fn())
    p.offer(1); await vi.advanceTimersByTimeAsync(100)
    p.offer(2); p.offer(3)
    done(); await vi.advanceTimersByTimeAsync(100)
    expect(publish.mock.calls.map(call => call[0])).toEqual([1, 3])
    p.stop()
  })
})
