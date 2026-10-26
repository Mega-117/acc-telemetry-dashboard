// PIP-619: Statistiche di attivita' — calcoli puri e riepilogo dal PC scritto solo se cambia.
import { describe, expect, it, vi } from 'vitest'
import {
  airBandOf, buildStatsSummary, mergeStatsSummary, compareCars, contributionFromSession, filterCombos, filterSessions,
  idealLapMs, parseStatsSummary, statsSummaryFingerprint, timeByCar, timeByWeek,
} from '~/services/telemetry/activityStats'
import { refreshStatsSummary, statsSummaryPath, type StatsSummaryStorage } from '~/services/sync/statsSummaryService'
import { formatLapConditions, lapConditions, mergeLapConditions, normalizeLapTrace } from '~/services/telemetry/lapTraceChart'
import type { SessionDocument } from '~/types/telemetry'

const lap = (over: Record<string, unknown> = {}) => ({
  lap_number: 2, lap_time_ms: 104000, is_valid: true, completeness: 'complete', validity: 'valid',
  air_temp: 19, road_temp: 25, track_grip_status: 'Optimum', sectors_reliable: true, sector_times_ms: [37000, 38000, 29000], ...over,
})
const raw = (laps: unknown[], over: Record<string, unknown> = {}) => ({
  ownerId: 'u1', schema: 'racercore.session', version: 1, game_id: 'acc', session_info: { track: 'Hungaroring', car: 'ferrari_296_gt3', date_start: '2026-10-25T08:58:31' }, stints: [{ laps }], ...over,
})

describe('contributionFromSession', () => {
  it('takes best lap, best reliable sectors, best per air band and per grip from valid complete laps', () => {
    const c = contributionFromSession(raw([
      lap({ lap_time_ms: 104500, air_temp: 19, sector_times_ms: [36900, 38500, 29100] }),
      lap({ lap_time_ms: 104100, air_temp: 23, track_grip_status: 'Fast', sector_times_ms: [37100, 37900, 29100] }),
      lap({ lap_time_ms: 103000, is_valid: false }),
      lap({ lap_time_ms: 103500, completeness: 'partial' }),
      lap({ lap_time_ms: 104300, sectors_reliable: false, sector_times_ms: [1, 1, 1] }),
    ]))!
    expect(c.key).toBe('hungaroring|ferrari_296_gt3')
    expect(c.bestLapMs).toBe(104100)
    expect(c.bestSectorsMs).toEqual([36900, 37900, 29100])
    // One session with laps at 19 and 23 degrees counts in both bands.
    expect(c.byAir).toEqual({ '15-20': 104300, '20-25': 104100 })
    expect(c.byGrip).toEqual({ Optimum: 104300, Fast: 104100 })
  })

  it('ignores other games and sessions without usable laps', () => {
    expect(contributionFromSession(raw([lap()], { game_id: 'evo' }))).toBeNull()
    expect(contributionFromSession(raw([lap({ is_valid: false })]))).toBeNull()
  })

  it('air bands have non overlapping edges', () => {
    expect([airBandOf(14.9), airBandOf(15), airBandOf(20), airBandOf(29.9), airBandOf(30), airBandOf(undefined)])
      .toEqual(['lt15', '15-20', '20-25', '25-30', 'ge30', null])
  })
})

describe('buildStatsSummary', () => {
  it('merges sessions per track and car and gives the ideal lap', () => {
    const a = contributionFromSession(raw([lap({ sector_times_ms: [37000, 38000, 29500] })]))!
    const b = contributionFromSession(raw([lap({ lap_time_ms: 103900, air_temp: 26, sector_times_ms: [37200, 37700, 29000] })], { session_info: { track: 'Hungaroring', car: 'ferrari_296_gt3', date_start: '2026-10-26T10:00:00' } }))!
    const s = buildStatsSummary([a, b], '2026-10-26T12:00:00Z')
    const combo = s.combos['hungaroring|ferrari_296_gt3']!
    expect(combo.sessions).toBe(2)
    expect(combo.bestLapMs).toBe(103900)
    expect(combo.bestSectorsMs).toEqual([37000, 37700, 29000])
    expect(idealLapMs(combo.bestSectorsMs)).toBe(103700)
    expect(combo.byAir).toEqual({ '15-20': 104000, '25-30': 103900 })
    expect(combo.lastDate).toBe('2026-10-26T10:00:00')
    expect(statsSummaryFingerprint(s)).toBe(statsSummaryFingerprint(buildStatsSummary([b, a], 'another time')))
    expect(mergeStatsSummary(s, [], ['x'], 't').counted).toEqual(['x'])
    expect(parseStatsSummary(JSON.parse(JSON.stringify(s)))?.sessionsCounted).toBe(2)
    expect(parseStatsSummary({ schemaVersion: 99, combos: {} })).toBeNull()
    expect(idealLapMs([1, null, 2])).toBeNull()
    expect(filterCombos(s, { trackKey: 'monza', carKey: null })).toEqual([])
    expect(filterCombos(s, { trackKey: 'hungaroring', carKey: null })).toHaveLength(1)
  })
})

const session = (over: { car?: string, track?: string, date?: string, type?: number, time?: number, best?: number | null, game?: string }): SessionDocument => ({
  sessionId: Math.random().toString(36), meta: { gameId: over.game ?? 'acc', track: over.track ?? 'Monza', car: over.car ?? 'ferrari_296_gt3', date_start: over.date ?? '2026-10-20T10:00:00Z', session_type: over.type ?? 0 },
  summary: { totalTime: over.time ?? 3_600_000, laps: 20, lapsValid: 15, bestLap: over.best ?? 108000 },
} as unknown as SessionDocument)

describe('views from the session list', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')
  const list = [
    session({ car: 'ferrari_296_gt3', track: 'Monza', best: 108000 }),
    session({ car: 'porsche_992_gt3_r', track: 'Monza', best: 108400, time: 1_800_000 }),
    session({ car: 'porsche_992_gt3_r', track: 'Spa', date: '2026-01-01T10:00:00Z' }),
    session({ car: 'ferrari_296_gt3', track: 'Monza', type: 2, best: 107900 }),
    session({ game: 'evo' }),
  ]

  it('filters by period, track, car and type, ACC only', () => {
    expect(filterSessions(list, { periodDays: 90, trackKey: null, carKey: null, sessionType: null }, now)).toHaveLength(3)
    expect(filterSessions(list, { periodDays: null, trackKey: 'spa', carKey: null, sessionType: null }, now)).toHaveLength(1)
    expect(filterSessions(list, { periodDays: null, trackKey: null, carKey: null, sessionType: 2 }, now)).toHaveLength(1)
  })

  it('sums time per car and per week', () => {
    const recent = filterSessions(list, { periodDays: 90, trackKey: null, carKey: null, sessionType: null }, now)
    expect(timeByCar(recent).map(c => [c.carKey, c.timeMs, c.sessions])).toEqual([['ferrari_296_gt3', 7_200_000, 2], ['porsche_992_gt3_r', 1_800_000, 1]])
    const weeks = timeByWeek(recent, 4, now)
    expect(weeks).toHaveLength(4)
    expect(weeks.reduce((sum, w) => sum + w.timeMs, 0)).toBe(9_000_000)
  })

  it('compares two cars on the tracks in common', () => {
    const rows = compareCars(list, 'ferrari_296_gt3', 'porsche_992_gt3_r')
    expect(rows[0]).toMatchObject({ trackKey: 'monza', bestA: 107900, bestB: 108400, gapMs: 500 })
    expect(rows.find(r => r.trackKey === 'spa')?.gapMs).toBeNull()
  })
})

describe('lap conditions in the Telemetria pickers', () => {
  it('reads them from the lap, fills the gaps from the session lap, formats only what exists', () => {
    const trace = normalizeLapTrace({ schema: 'acc.laptrace.v1', grid_step_m: 2,
      meta: { track: 'Hungaroring', car: 'ferrari', lap_time_s: 104.2, grip_status: 'Fast', extra: { conditions: { air_c: 21.6, road_c: null, grip: 'Optimum' } } },
      channels: { time_s: [0, 1], speed_kmh: [1, 2], brake_pct: [0, 0], throttle_pct: [1, 1] } })!
    expect(trace.conditions).toEqual({ airC: 21.6, roadC: null, grip: 'Optimum' })
    expect(formatLapConditions(mergeLapConditions(trace.conditions, { air_temp: 15, road_temp: 29.4, track_grip_status: 'Green' }))).toBe('22°/29° OPT')
    expect(formatLapConditions(mergeLapConditions(null, { air_temp: 15 }))).toBe('15°/–')
    expect(mergeLapConditions(null, undefined)).toBeNull()
    expect(lapConditions({ air: Infinity, grip: 'not a word!' })).toBeNull()
    expect(formatLapConditions(null)).toBe('')
  })
})

describe('refreshStatsSummary', () => {
  const memory = (): StatsSummaryStorage => {
    const data: Record<string, string> = {}
    return { get: k => data[k] ?? null, set: (k, v) => { data[k] = v } }
  }
  const localRaw = raw([lap()], { session_info: { track: 'Hungaroring', car: 'ferrari_296_gt3', date_start: '2026-10-25T08:58:31' } })
  const localId = '2026_10_25T08_58_31_Hungaroring'
  const listed = (id: string, lapsValid = 5) => ({ sessionId: id, meta: { gameId: 'acc' }, summary: { lapsValid } } as unknown as SessionDocument)
  const sessions = [listed(localId), listed('cloud-a'), listed('cloud-b'), listed('no-laps', 0)]
  const cloud: Record<string, unknown> = { 'cloud-a': raw([lap({ lap_time_ms: 103000, air_temp: 27 })]), 'cloud-b': null }
  const electronAPI = { getTelemetryFiles: async () => [{ name: 'session_x.json', size: 1, mtime: 1 }, { name: 'live_state.json', size: 1, mtime: 1 }], readFile: vi.fn(async () => localRaw) }

  it('takes local files first, the rest from the cloud once, and never counts a session twice', async () => {
    const storage = memory()
    const readCloudSession = vi.fn(async (id: string) => cloud[id] ?? null)
    const write = vi.fn(async () => {})
    const first = await refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession, write, electronAPI, storage })
    expect(readCloudSession.mock.calls.map(c => c[0]).sort()).toEqual(['cloud-a', 'cloud-b'])
    expect(write).toHaveBeenCalledWith(statsSummaryPath('u1'), expect.objectContaining({ sessionsCounted: 2 }))
    expect(write.mock.calls[0]![0]).toBe('users/u1/sessionListMeta/statsV1')
    expect(first.summary!.counted.sort()).toEqual([localId, 'cloud-a', 'cloud-b'].sort())
    expect(first.summary!.combos['hungaroring|ferrari_296_gt3']!.byAir).toEqual({ '15-20': 104000, '25-30': 103000 })

    const again = await refreshStatsSummary({ uid: 'u1', sessions, existing: first.summary, readCloudSession, write, electronAPI, storage })
    expect(again).toMatchObject({ written: false, cloudReads: 0, filesRead: 0, remaining: 0 })
    expect(readCloudSession).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('stops at the daily cloud cap and resumes on another day; a network error is retried', async () => {
    const storage = memory()
    let day = '2026-10-26T10:00:00Z'
    const now = () => new Date(day)
    const readCloudSession = vi.fn(async (id: string) => { if (id === 'cloud-b') throw new Error('offline'); return cloud[id] ?? null })
    const write = vi.fn(async () => {})
    const r1 = await refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession, write, storage, now, dailyCloudReads: 1 })
    expect(r1.cloudReads).toBe(1)
    expect(r1.remaining).toBe(2)
    const r2 = await refreshStatsSummary({ uid: 'u1', sessions, existing: r1.summary, readCloudSession, write, storage, now, dailyCloudReads: 1 })
    expect(r2.cloudReads).toBe(0)
    day = '2026-10-27T10:00:00Z'
    const r3 = await refreshStatsSummary({ uid: 'u1', sessions, existing: r2.summary, readCloudSession, write, storage, now, dailyCloudReads: 1 })
    expect(r3.cloudReads).toBe(1)
    expect(r3.summary!.counted).not.toContain('cloud-b')
  })

  it('a failed write keeps the read counter and is retried next time', async () => {
    const storage = memory()
    const readCloudSession = async (id: string) => cloud[id] ?? null
    await expect(refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession, write: async () => { throw new Error('offline') }, storage })).rejects.toThrow('offline')
    const write = vi.fn(async () => {})
    expect((await refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession, write, storage })).written).toBe(true)
  })
})
