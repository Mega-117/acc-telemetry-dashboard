import { afterEach, expect, it, vi } from 'vitest'
import { createSurfaceHealthReporter } from '~/services/overlay/surfaceHealthReporter'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('acknowledges only settled snapshots, beats locally and cleans up', () => {
  vi.useFakeTimers()
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const frame = (cb: FrameRequestCallback) => { frames.set(++id, cb); return id }
  const cancel = (key: number) => { frames.delete(key) }
  const tick = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(0)) }
  const report = vi.fn().mockResolvedValue(true)
  const h = createSurfaceHealthReporter(report, frame, cancel)
  h.update({ epoch: 1, presentationRevision: 1 })
  tick(); expect(report).not.toHaveBeenCalled()
  h.update({ epoch: 1, presentationRevision: 2 })
  tick(); tick(); expect(report).toHaveBeenLastCalledWith(1, 2, true)
  h.update({ epoch: 1, presentationRevision: 2 })
  expect(frames.size).toBe(0)
  vi.advanceTimersByTime(1000); expect(report).toHaveBeenCalledTimes(2)
  h.update({ epoch: 2, presentationRevision: 3 })
  h.stop(); tick(); vi.advanceTimersByTime(2000)
  expect(report).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})
it('fails closed on component error and tolerates IPC rejection', async () => {
  vi.useFakeTimers()
  const report = vi.fn().mockRejectedValue(new Error('closed'))
  const h = createSurfaceHealthReporter(report, () => 1, () => {})
  h.update({ epoch: 2, presentationRevision: 5 }); h.fail()
  expect(report).toHaveBeenCalledWith(2, 5, false)
  h.update({ epoch: 2, presentationRevision: 6 })
  vi.advanceTimersByTime(5000)
  expect(report).toHaveBeenCalledTimes(1)
  await Promise.resolve()
})

it('prepares layout with timers even while native window is hidden', () => {
  vi.useFakeTimers()
  const layout = vi.fn()
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  vi.stubGlobal('document', { documentElement: { getBoundingClientRect: layout }, hidden: true })
  const report = vi.fn().mockResolvedValue(true)
  const h = createSurfaceHealthReporter(report)
  h.update({ epoch: 4, presentationRevision: 8 })
  vi.advanceTimersByTime(32); expect(report).not.toHaveBeenCalled()
  vi.advanceTimersByTime(32); expect(report).toHaveBeenCalledWith(4, 8, true)
  expect(layout).toHaveBeenCalledTimes(2)
  h.update({ epoch: 4, presentationRevision: 9 }); h.stop()
  vi.advanceTimersByTime(2000); expect(report).toHaveBeenCalledTimes(1)
})
