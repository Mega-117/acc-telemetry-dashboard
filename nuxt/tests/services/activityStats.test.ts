// PIP-619: Statistiche di attivita' — calcoli puri e riepilogo dal PC scritto solo se cambia.
import { describe, expect, it, vi } from 'vitest'
import {
  airBandOf, mergeStatsSummary, compareCars, contributionFromSession, filterCombos, filterSessions,
  idealLapMs, parseStatsSummary, statsSummaryFingerprint, StatsSummaryTooLargeError, timeByCar, timeByWeek,
  type StatsSessionUpdate, type StatsSummary,
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

describe('mergeStatsSummary', () => {
  const a = contributionFromSession(raw([lap({ sector_times_ms: [37000, 38000, 29500] })]))!
  const b = contributionFromSession(raw([lap({ lap_time_ms: 103900, air_temp: 26, sector_times_ms: [37200, 37700, 29000] })], { session_info: { track: 'Hungaroring', car: 'ferrari_296_gt3', date_start: '2026-10-26T10:00:00' } }))!
  const up = (sessionId: string, contribution: typeof a | null, lapsValid = 5) => ({ sessionId, lapsValid, contribution })

  it('merges sessions per track and car and gives the ideal lap', () => {
    const s = mergeStatsSummary(null, [up('s-a', a), up('s-b', b), up('s-empty', null, 0)], '2026-10-26T12:00:00Z')
    const combo = s.combos['hungaroring|ferrari_296_gt3']!
    expect(combo.sessions).toBe(2)
    expect(combo.bestLapMs).toBe(103900)
    expect(combo.bestSectorsMs).toEqual([37000, 37700, 29000])
    expect(idealLapMs(combo.bestSectorsMs)).toBe(103700)
    expect(combo.byAir).toEqual({ '15-20': 104000, '25-30': 103900 })
    expect(combo.lastDate).toBe('2026-10-26T10:00:00')
    expect(s.counted).toEqual({ 's-a': 5, 's-b': 5, 's-empty': 0 })
    expect(statsSummaryFingerprint(s)).toBe(statsSummaryFingerprint(mergeStatsSummary(null, [up('s-b', b), up('s-empty', null, 0), up('s-a', a)], 'another time')))
    expect(parseStatsSummary(JSON.parse(JSON.stringify(s)))?.counted).toEqual(s.counted)
    expect(parseStatsSummary({ schemaVersion: 99, combos: {}, counted: {} })).toBeNull()
    expect(idealLapMs([1, null, 2])).toBeNull()
    expect(filterCombos(s, { trackKey: 'monza', carKey: null })).toEqual([])
    expect(filterCombos(s, { trackKey: 'hungaroring', carKey: null })).toHaveLength(1)
  })

  it('a recounted session (more laps after a mid-session sync) improves records without counting twice', () => {
    const first = mergeStatsSummary(null, [up('s-a', a, 3)], '2026-10-26T12:00:00Z')
    const better = contributionFromSession(raw([lap({ lap_time_ms: 103500, sector_times_ms: [36800, 37900, 28800] })]))!
    const again = mergeStatsSummary(first, [up('s-a', better, 6)], '2026-10-26T13:00:00Z')
    expect(again.combos['hungaroring|ferrari_296_gt3']).toMatchObject({ sessions: 1, bestLapMs: 103500, bestSectorsMs: [36800, 37900, 28800] })
    expect(again.counted).toEqual({ 's-a': 6 })
  })

  it('cloud reads add up within the day and restart the next day; an oversized summary is refused', () => {
    const d1 = mergeStatsSummary(null, [], '2026-10-26T10:00:00Z', 40)
    expect(mergeStatsSummary(d1, [], '2026-10-26T18:00:00Z', 10).cloudReads).toEqual({ day: '2026-10-26', count: 50 })
    expect(mergeStatsSummary(d1, [], '2026-10-27T08:00:00Z', 5).cloudReads).toEqual({ day: '2026-10-27', count: 5 })
    const many = Array.from({ length: 30_000 }, (_, i) => up(`2026_10_25T08_58_31_Hungaroring_${i}`, null))
    expect(() => mergeStatsSummary(null, many, 't')).toThrow(StatsSummaryTooLargeError)
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
  /** The document as Firestore would keep it: every commit merges into the latest saved version. */
  const store = (now = () => '2026-10-26T10:00:00Z') => {
    const box: { doc: StatsSummary | null, commits: number } = { doc: null, commits: 0 }
    const commit = vi.fn(async (path: string, updates: StatsSessionUpdate[], reads: number) => {
      expect(path).toBe('users/u1/sessionListMeta/statsV1')
      box.commits += 1
      box.doc = mergeStatsSummary(box.doc, updates, now(), reads)
      return box.doc
    })
    return { box, commit }
  }
  const localRaw = raw([lap()], { session_info: { track: 'Hungaroring', car: 'ferrari_296_gt3', date_start: '2026-10-25T08:58:31' } })
  const localId = '2026_10_25T08_58_31_Hungaroring'
  const listed = (id: string, lapsValid = 5) => ({ sessionId: id, meta: { gameId: 'acc' }, summary: { lapsValid } } as unknown as SessionDocument)
  const sessions = [listed(localId), listed('cloud-a'), listed('cloud-b'), listed('no-laps', 0)]
  const cloud: Record<string, unknown> = { 'cloud-a': raw([lap({ lap_time_ms: 103000, air_temp: 27 })]), 'cloud-b': null }
  const electronAPI = { getTelemetryFiles: async () => [{ name: 'session_x.json', size: 1, mtime: 1 }, { name: 'live_state.json', size: 1, mtime: 1 }], readFile: vi.fn(async () => localRaw) }
  const reader = (fail?: string) => vi.fn(async (id: string) => { if (id === fail) throw new Error('offline'); return { raw: cloud[id] ?? null, reads: 1 } })

  it('takes local files first, the rest from the cloud once, and never counts a session twice', async () => {
    const { box, commit } = store()
    const readCloudSession = reader()
    const first = await refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession, commit, electronAPI, storage: memory() })
    expect(readCloudSession.mock.calls.map(c => c[0]).sort()).toEqual(['cloud-a', 'cloud-b'])
    expect(statsSummaryPath('u1')).toBe('users/u1/sessionListMeta/statsV1')
    expect(Object.keys(first.summary!.counted).sort()).toEqual([localId, 'cloud-a', 'cloud-b'].sort())
    expect(first.summary!.combos['hungaroring|ferrari_296_gt3']!.byAir).toEqual({ '15-20': 104000, '25-30': 103000 })
    expect(first.summary!.cloudReads.count).toBe(2)

    const again = await refreshStatsSummary({ uid: 'u1', sessions, existing: box.doc, readCloudSession, commit, electronAPI, storage: memory() })
    expect(again).toMatchObject({ written: false, cloudReads: 0, remaining: 0 })
    expect(readCloudSession).toHaveBeenCalledTimes(2)
    expect(box.commits).toBe(1)
  })

  it('recounts a session whose valid laps changed in the list', async () => {
    const { box, commit } = store()
    await refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession: reader(), commit, storage: memory() })
    const readCloudSession = reader()
    await refreshStatsSummary({ uid: 'u1', sessions: [listed('cloud-a', 9)], existing: box.doc, readCloudSession, commit, storage: memory() })
    expect(readCloudSession.mock.calls.map(c => c[0])).toEqual(['cloud-a'])
    expect(box.doc!.counted['cloud-a']).toBe(9)
  })

  it('the daily cap is shared through the document (another PC) and restarts the next day; a network error is retried', async () => {
    let day = '2026-10-26T10:00:00Z'
    const { box, commit } = store(() => day)
    const now = () => new Date(day)
    const readCloudSession = reader('cloud-b')
    const two = [listed('cloud-a'), listed('cloud-b')]
    const r1 = await refreshStatsSummary({ uid: 'u1', sessions: two, existing: null, readCloudSession, commit, storage: memory(), now, dailyCloudReads: 1 })
    expect(r1).toMatchObject({ cloudReads: 1, remaining: 1 })
    // Another PC (empty local storage) the same day: the counter in the document stops it.
    const r2 = await refreshStatsSummary({ uid: 'u1', sessions: two, existing: box.doc, readCloudSession, commit, storage: memory(), now, dailyCloudReads: 1 })
    expect(r2.cloudReads).toBe(0)
    day = '2026-10-27T10:00:00Z'
    const r3 = await refreshStatsSummary({ uid: 'u1', sessions: two, existing: box.doc, readCloudSession, commit, storage: memory(), now, dailyCloudReads: 1 })
    expect(r3.cloudReads).toBe(0) // cloud-b failed: not counted, retried later
    expect(Object.keys(box.doc!.counted)).not.toContain('cloud-b')
  })

  it('keeps one run per user: two accounts never share a result', async () => {
    const a = store(), b = store()
    const [ra, rb] = await Promise.all([
      refreshStatsSummary({ uid: 'u1', sessions: [listed('cloud-a')], existing: null, readCloudSession: reader(), commit: a.commit, storage: memory() }),
      refreshStatsSummary({ uid: 'u2', sessions: [listed('cloud-b')], existing: null, readCloudSession: reader(), commit: async (_p, updates, reads) => mergeStatsSummary(null, updates, 't', reads), storage: memory() }),
    ])
    expect(Object.keys(ra.summary!.counted)).toEqual(['cloud-a'])
    expect(Object.keys(rb.summary!.counted)).toEqual(['cloud-b'])
    expect(b.box.commits).toBe(0)
  })

  it('a failed commit keeps the device read counter and is retried next time', async () => {
    const storage = memory()
    await expect(refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession: reader(), commit: async () => { throw new Error('offline') }, storage })).rejects.toThrow('offline')
    const { commit } = store()
    const ok = await refreshStatsSummary({ uid: 'u1', sessions, existing: null, readCloudSession: reader(), commit, storage, dailyCloudReads: 4 })
    expect(ok.written).toBe(true)
    expect(ok.cloudReads).toBe(1) // 3 of the 4 daily reads were already used by the failed run on this PC
  })

  it('an oversized summary is not written', async () => {
    const result = await refreshStatsSummary({ uid: 'u1', sessions: [listed('cloud-a')], existing: null, readCloudSession: reader(), commit: async () => { throw new StatsSummaryTooLargeError() }, storage: memory() })
    expect(result).toMatchObject({ written: false, reason: 'too-large' })
  })
})
