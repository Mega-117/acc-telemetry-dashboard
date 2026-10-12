import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { appliedTelemetry, receivedTelemetry, createTelemetryPull, telemetryApplied, withRecoveryDeadline } from '../../app/services/overlay/telemetryRecovery'

afterEach(() => vi.useRealTimers())
describe('bounded telemetry pull', () => {
  it('checkpoint I/O cannot block readiness indefinitely', async () => {
    vi.useFakeTimers()
    const pending = withRecoveryDeadline(() => new Promise(() => {}), null)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await pending).toBeNull()
    expect(await withRecoveryDeadline(() => Promise.reject(Error('disk')), null)).toBeNull()
  })
  it('does not overlap and discards a late result after its deadline', async () => {
    vi.useFakeTimers()
    let resolve!: (value: number) => void
    const read = vi.fn().mockImplementationOnce(() => new Promise<number>(r => { resolve = r })).mockResolvedValue(2)
    const apply = vi.fn(), report = vi.fn()
    const pull = createTelemetryPull(read, apply, report)
    const first = pull.poll()
    await Promise.resolve(); await pull.poll()
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10000); await first
    await pull.poll(); resolve(1); await Promise.resolve()
    expect(apply.mock.calls).toEqual([[2]])
    expect(report).toHaveBeenCalledWith('ipc-timeout')
    pull.stop()
  })
  it('push supersedes pull; errors remain recoverable; stop invalidates the attempt', async () => {
    let resolve!: (value: number) => void
    const read = vi.fn().mockRejectedValueOnce(Error()).mockImplementationOnce(() => new Promise<number>(r => { resolve = r })).mockResolvedValue(3)
    const apply = vi.fn(), pull = createTelemetryPull(read, apply)
    await pull.poll()
    const pending = pull.poll(); await Promise.resolve(); pull.invalidate(); resolve(2); await pending
    expect(apply).not.toHaveBeenCalled()
    await pull.poll(); expect(apply).toHaveBeenCalledWith(3)
    pull.stop(); await pull.poll(); expect(read).toHaveBeenCalledTimes(3)
  })
  it('acknowledges assignment only after Vue flush', async () => {
    telemetryApplied({ hud_transport: { version: 1, bootId: 'current', sequence: 7 } })
    expect(receivedTelemetry().fast).toEqual({ version: 1, bootId: 'current', sequence: 7 })
    expect(appliedTelemetry()?.sequence).not.toBe(7)
    await nextTick()
    expect(appliedTelemetry()).toEqual({ version: 1, bootId: 'current', sequence: 7, valid: true })
    telemetryApplied({ hud_transport: { version: 0, bootId: 'old', sequence: 8 } })
    await nextTick(); expect(appliedTelemetry()?.sequence).toBe(7)
    telemetryApplied({ hud_transport: { version: 1, bootId: 'current', sequence: 8 } }, false)
    await nextTick(); expect(appliedTelemetry()?.valid).toBe(false)
  })
})
