import { describe, expect, it, vi } from 'vitest'

vi.mock('~/services/telemetry/lapTraceChart', () => ({
  normalizeLapTrace: (raw: { complete?: boolean, broken?: boolean }) => (raw?.broken ? null : { complete: raw?.complete !== false }),
}))

import { ARCHIVE_READS_AT_ONCE, readSessionLaps, withArchiveFallback, type SessionLapResult } from '~/services/telemetry/sessionLapLoading'

const lap = (lapNumber: number, origin = 'local') => ({ id: `l${lapNumber}`, lapNumber, lapTimeMs: 100_000 + lapNumber, origin, sessionToken: 's' })
function source(laps: ReturnType<typeof lap>[], traces: Record<string, unknown>) {
  return { list: vi.fn(async () => laps), read: vi.fn(async (d: { id: string }) => { if (!(d.id in traces)) throw new Error('gone'); return traces[d.id] }) }
}

describe('01/11 laps of a session in the Telemetria tab', () => {
  it('reads every lap, leaves out unreadable ones and keeps the validity of the session table', async () => {
    const src = source([lap(1), lap(2), lap(3)], { l1: { complete: true }, l2: { broken: true } })
    const result = await readSessionLaps(src as never, 's', new Map([[1, true]]), () => true, false)
    expect(result?.total).toBe(3)
    expect(result?.ok.map(r => [r.entry.lapNumber, r.entry.valid, r.entry.complete])).toEqual([[1, true, true]])
  })

  it('unknown validity stays unknown, never invalid (Codex 01/11)', async () => {
    const src = source([lap(1), lap(2)], { l1: { complete: true }, l2: { complete: true } })
    const result = await readSessionLaps(src as never, 's', new Map<number, boolean | null>([[1, null], [2, false]]), () => true, false)
    expect(result?.ok.map(r => [r.entry.lapNumber, r.entry.valid, r.entry.validUnknown])).toEqual([[1, false, true], [2, false, false]])
  })

  it('stops when the view changed', async () => {
    let current = true
    const src = source([lap(1), lap(2)], { l1: { complete: true }, l2: { complete: true } })
    src.read.mockImplementation(async () => { current = false; return { complete: true } })
    expect(await readSessionLaps(src as never, 's', new Map(), () => current, true)).toBeNull()
  })

  // QA 10/11: a 40-lap race from the archive took 6-10 s, one lap after another.
  it('archive laps: a few at a time, never more than the limit, results in lap order', async () => {
    const laps = Array.from({ length: 10 }, (_, i) => lap(i + 1, 'pilot'))
    let inFlight = 0, peak = 0
    const src = source(laps, {})
    src.read.mockImplementation(async (d: { id: string }) => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 5 + (11 - Number(d.id.slice(1)))))
      inFlight--
      return { complete: true }
    })
    const result = await readSessionLaps(src as never, 's', new Map(), () => true, true)
    expect(result?.ok.map(r => r.entry.lapNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(peak).toBe(ARCHIVE_READS_AT_ONCE)
    expect(ARCHIVE_READS_AT_ONCE).toBeGreaterThan(1)
  })

  it('archive laps: no new read starts once the view changed', async () => {
    let current = true
    const src = source(Array.from({ length: 10 }, (_, i) => lap(i + 1, 'pilot')), {})
    src.read.mockImplementation(async () => { current = false; return { complete: true } })
    expect(await readSessionLaps(src as never, 's', new Map(), () => current, true)).toBeNull()
    expect(src.read.mock.calls.length).toBeLessThanOrEqual(ARCHIVE_READS_AT_ONCE)
  })

  it('in the program: a session with no complete lap on this PC takes its laps from the online archive', async () => {
    const empty: SessionLapResult = { total: 0, ok: [] }
    const archived: SessionLapResult = { total: 1, ok: [{ trace: { complete: true } as never, entry: { lapNumber: 4, origin: 'pilot' } as never }] }
    expect(await withArchiveFallback(empty, async () => archived)).toEqual({ result: archived, fromArchive: true })
    // Partial laps only on the PC: the archive is asked too.
    const partial: SessionLapResult = { total: 1, ok: [{ trace: { complete: false } as never, entry: { lapNumber: 1 } as never }] }
    expect((await withArchiveFallback(partial, async () => archived))?.fromArchive).toBe(true)
  })

  it('keeps the PC laps when they exist, and when the archive has nothing or fails', async () => {
    const local: SessionLapResult = { total: 1, ok: [{ trace: { complete: true } as never, entry: { lapNumber: 1 } as never }] }
    const archive = vi.fn(async () => null)
    expect(await withArchiveFallback(local, archive)).toEqual({ result: local, fromArchive: false })
    expect(archive).not.toHaveBeenCalled()
    const empty: SessionLapResult = { total: 0, ok: [] }
    expect(await withArchiveFallback(empty, async () => ({ total: 0, ok: [] }))).toEqual({ result: empty, fromArchive: false })
    expect(await withArchiveFallback(empty, async () => { throw new Error('offline') })).toEqual({ result: empty, fromArchive: false })
  })
})
