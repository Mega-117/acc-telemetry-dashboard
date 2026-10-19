import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDashboardEntryRecovery, type EntryState } from '../../app/services/auth/dashboardEntryRecovery'
import { readFileSync } from 'node:fs'

afterEach(() => vi.useRealTimers())
function fixture() {
  const changes: EntryState[] = []
  const recovery = createDashboardEntryRecovery({ onChange: state => changes.push(state), timeoutMs: 100 })
  return { ...recovery, changes }
}
describe('dashboard entry recovery', () => {
  it('opens normally and does not overlap repeated requests', async () => {
    const f = fixture(), work = vi.fn(async a => { await a.step('route', async () => {}) })
    const one = f.run(work, () => true), two = f.run(work, () => true)
    expect(one).toBe(two)
    await one
    expect(work).toHaveBeenCalledTimes(1)
    expect(f.changes.at(-1)?.status).toBe('ready')
  })
  it('retries a failed route once without any auth operations', async () => {
    const f = fixture(), route = vi.fn().mockRejectedValueOnce(Error('secret url')).mockResolvedValue(undefined)
    await f.run(a => a.step('route', route), () => true)
    expect(route).toHaveBeenCalledTimes(2)
    expect(f.changes.some(s => s.status === 'retrying' && s.phase === 'route')).toBe(true)
    expect(f.changes.at(-1)?.status).toBe('ready')
    expect(JSON.stringify(f.changes)).not.toContain('secret')
  })
  it('finishes two hung attempts and permits a manual retry', async () => {
    vi.useFakeTimers()
    const f = fixture(), work = vi.fn(a => a.step('cache', () => new Promise(() => {})))
    const run = f.run(work, () => true)
    await vi.advanceTimersByTimeAsync(201); await run
    expect(f.changes.at(-1)).toEqual({ status: 'failed', phase: 'cache', attempt: 2, reason: 'timeout' })
    expect(work).toHaveBeenCalledTimes(2)
    await f.run(a => a.step('route', async () => {}), () => true)
    expect(f.changes.at(-1)?.status).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('records failures in overview and route and stops after the retry', async () => {
    for (const phase of ['overview', 'route'] as const) {
      const f = fixture()
      await f.run(a => a.step(phase, async () => { throw Error('failure') }), () => true)
      expect(f.changes.at(-1)).toMatchObject({ status: 'failed', phase, attempt: 2, reason: 'operation-failed' })
    }
  })
  it('invalidates late work after timeout before it can enter the dashboard', async () => {
    vi.useFakeTimers()
    const f = fixture(), entered = vi.fn()
    let finish!: () => void
    let calls = 0
    const result = f.run(async a => {
      await a.step('route', () => ++calls === 1 ? new Promise<void>(r => { finish = r }) : Promise.resolve())
      if (a.isCurrent()) entered()
    }, () => true)
    await vi.advanceTimersByTimeAsync(101); await result
    finish(); await Promise.resolve()
    expect(entered).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancel/unmount settles pending work and keeps a new owner isolated', async () => {
    vi.useFakeTimers()
    const f = fixture(), entered = vi.fn()
    const old = f.run(async a => { await a.step('route', () => new Promise(() => {})); entered() }, () => true)
    await vi.advanceTimersByTimeAsync(0); f.cancel(); await old
    await f.run(a => a.step('route', async () => {}), () => true)
    expect(entered).not.toHaveBeenCalled()
    expect(f.changes.at(-1)?.status).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not enter when ownership is revoked', async () => {
    const f = fixture(), work = vi.fn()
    await f.run(work, () => false)
    expect(work).not.toHaveBeenCalled()
  })
  it('shell wires bounded phases, retry button, cancellation and diagnostics', () => {
    const shell = readFileSync(new URL('../../app/app.vue', import.meta.url), 'utf8')
    for (const phase of ['cache', 'overview', 'route']) expect(shell).toContain(`attempt.step('${phase}'`)
    expect(shell).toContain('@click="retryLoading()"')
    expect(shell).toContain('dashboardEntryRecovery.cancel()')
    expect(shell).toContain('reportRuntimeHealth?.({ dashboardEntry: state })')
    expect(shell).toContain('if (!attempt.isCurrent()) return')
  })
})
