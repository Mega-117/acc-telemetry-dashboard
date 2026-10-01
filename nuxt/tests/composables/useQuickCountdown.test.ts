import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuickCountdown } from '~/composables/useQuickCountdown'

describe('quick countdown deadline', () => {
  afterEach(() => vi.useRealTimers())
  function setup() {
    vi.useFakeTimers()
    const reveal = vi.fn(); const done = vi.fn(); const scope = effectScope()
    const timer = scope.run(() => useQuickCountdown(reveal, done))!
    return { timer, reveal, done, scope }
  }
  it('counts while hidden, reveals once at five seconds, finishes once and stays finished', () => {
    const { timer, reveal, done, scope } = setup()
    timer.start(10)
    expect(timer.display.value).toBe('00:10')
    vi.advanceTimersByTime(4900); expect(reveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100); expect(reveal).toHaveBeenCalledTimes(1)
    expect(timer.display.value).toBe('00:05')
    vi.advanceTimersByTime(15000)
    expect(reveal).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledTimes(1)
    expect(timer.status.value).toBe('finished'); expect(timer.display.value).toBe('00:00')
    expect(vi.getTimerCount()).toBe(0); scope.stop()
  })
  it('cancels all future effects and can restart', () => {
    const { timer, reveal, done, scope } = setup()
    timer.start(20); vi.advanceTimersByTime(1000); timer.cancel()
    vi.advanceTimersByTime(30000)
    expect(reveal).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled()
    expect(timer.status.value).toBe('idle')
    timer.start(1); expect(reveal).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000); expect(done).toHaveBeenCalledTimes(1); scope.stop()
  })
  it('uses the deadline after delayed ticks and disposes the interval', () => {
    const { timer, reveal, done, scope } = setup()
    timer.start(30); vi.setSystemTime(Date.now() + 40000); vi.advanceTimersByTime(100)
    expect(reveal).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledTimes(1)
    timer.start(20); scope.stop(); vi.advanceTimersByTime(30000)
    expect(done).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
  it.each([0, -1, NaN, Infinity, 6000])('rejects invalid duration %s', seconds => {
    const { timer, scope } = setup()
    expect(timer.start(seconds)).toBe(false); expect(timer.status.value).toBe('idle')
    expect(vi.getTimerCount()).toBe(0); scope.stop()
  })
})
