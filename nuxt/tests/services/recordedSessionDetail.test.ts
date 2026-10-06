import { describe, expect, it } from 'vitest'
import type { SessionDocument } from '~/types/telemetry'
import { recordedSessionForDetail, sessionDetailTrackId, formatRecordedNumber, compatibleRecordedSession } from '~/services/session-detail/recordedSessionAdapter'
import { vehicleSessionReferences } from '~/services/session-detail/vehicleSessionReferences'
import { buildSessionDetailLaps, buildBestSectorSummary } from '~/services/session-detail/sessionComparisonTableService'
import { formatLapTime } from '~/utils/telemetryFormat'
import { normalizeLapSeries, buildBoundaryLapExclusions } from '~/services/session-detail/sessionLapSeries'

const raw = () => ({ schema: 'racercore.session', version: 1, game_id: 'evo', capabilities: { sector_timing: true },
  session_info: { track: 'Monza', track_variant: 'GP', car: 'Ferrari', session_kind: 'practice', date_start: '2026-10-04T12:00:00Z', initial_track_grip_status: 'Green' },
  stints: [{ stint_number: 1, fuel_start: 50, laps: [{ lap_number: 1, lap_time_ms: 114972,
    completeness: 'complete', validity: 'valid', is_valid: true, fuel_start: 50, fuel_remaining: 48,
    air_temp: 26, road_temp: 35, sector_times_ms: [36693, 40107, 38172] }] }] })

describe('recorded EVO session uses ACC detail models', () => {
  it('uses the same truncated mean as persisted history', () => {
    const source = raw(), template = source.stints[0]!.laps[0]!
    source.stints[0]!.laps = [94345, 89020, 89310, 87777, 87487].map((ms, i) => ({ ...template, lap_number: i + 1, lap_time_ms: ms }))
    expect(recordedSessionForDetail(source)!.stints[0]!.avg_clean_lap).toBe(89587)
  })
  it('preserves raw export and supplies real sectors to the shared table and theoretical sector sum', () => {
    const source = raw(), original = JSON.stringify(source), adapted = recordedSessionForDetail(source)!
    const laps = buildSessionDetailLaps(adapted.stints[0]!.laps, formatLapTime)
    expect(laps[0]).toMatchObject({ fuel: 48, airTemp: 26, roadTemp: 35, grip: 'Green', valid: true })
    expect(buildBestSectorSummary(laps)).toEqual({ s1: 36693, s2: 40107, s3: 38172, lapMs: 114972 })
    expect(buildBoundaryLapExclusions(normalizeLapSeries({ laps, source: 'a', strategy: 'A', stintNumber: 1 })).size).toBe(0)
    expect(adapted.session_info).toMatchObject({ start_track_grip: 'Green', initial_track_grip_status: 'Green' })
    expect(sessionDetailTrackId(adapted)).toBe('layout:["monza","gp"]')
    expect(JSON.stringify(source)).toBe(original)
  })
  it.each([null, undefined, Number.NaN])('does not classify absent fuel %s as Q or R', fuel => {
    const source = raw(); source.stints[0]!.fuel_start = fuel as number
    const lap = source.stints[0]!.laps[0]!
    lap.air_temp = null as unknown as number; lap.road_temp = null as unknown as number
    const value = recordedSessionForDetail(source)!
    expect(value.stints[0]!.type).toBe('Unknown')
    expect(formatRecordedNumber(value.stints[0]!.fuel_start, 'L')).toBe('—')
    expect(formatRecordedNumber(value.stints[0]!.laps[0]!.air_temp, '°')).toBe('—')
  })
  it.each([[20, 'Qualify'], [30, 'Race'], [40, 'Race'], [50, 'Race']])('classifies %s L for session display', (fuel, type) => {
    const source = raw(); source.stints[0]!.fuel_start = fuel as number
    expect(recordedSessionForDetail(source)!.stints[0]!.type).toBe(type)
  })
  it('rejects invented or incomplete sectors and excludes unknown validity from bests', () => {
    for (const mutate of [(s: ReturnType<typeof raw>) => { s.capabilities.sector_timing = false },
      (s: ReturnType<typeof raw>) => { s.stints[0]!.laps[0]!.sector_times_ms[0] = 1 }]) {
      const source = raw(); mutate(source)
      expect(recordedSessionForDetail(source)!.stints[0]!.laps[0]!.sector_times_ms).toEqual([])
    }
    for (const state of ['partial', 'unknown']) {
      const source = raw(); source.stints[0]!.laps[0]!.validity = state
      expect(recordedSessionForDetail(source)!.session_info.session_best_lap).toBe(0)
    }
  })
  it('passes ACC through and rejects unsupported envelopes', () => {
    const acc = { session_info: { track: 'Monza', car: 'Ferrari', date_start: '', laps_total: 1, session_type: 0 }, stints: [], summary: { best_rules_version: 6 } }
    expect(recordedSessionForDetail(acc)).toBe(acc)
    expect(recordedSessionForDetail({ ...raw(), version: 2 })).toBeNull()
    expect(recordedSessionForDetail({ ...raw(), game_id: 'synthetic' })).toBeNull()
  })
  it('requires the same game and exact circuit variant for cross-session comparison', () => {
    const primary = recordedSessionForDetail(raw())!, candidate = recordedSessionForDetail(raw())!
    expect(compatibleRecordedSession(primary, candidate)).toBe(true)
    candidate.session_info.track_variant = 'Short'
    expect(compatibleRecordedSession(primary, candidate)).toBe(false)
    candidate.session_info.track_variant = 'GP'; candidate.game_id = 'acc'
    expect(compatibleRecordedSession(primary, candidate)).toBe(false)
  })
  it('reuses temperature conversion only with same vehicle, game, layout and actual temperatures', () => {
    const doc = (id: string, gameId = 'evo', car = 'Ferrari', trackVariant = 'GP', time = 100000) => ({
      sessionId: id, meta: { gameId, car, trackVariant, track: 'Monza', date_start: '2026-10-04', session_type: 0 },
      summary: { laps: 1, lapsValid: 1, best_by_grip: { Unknown: { bestQualy: time, bestQualyTemp: 20, bestQualyFuel: 10 } } }
    } as SessionDocument)
    const adapted = recordedSessionForDetail(raw())!, history = [doc('own'), doc('acc', 'acc', 'Ferrari', 'GP', 1), doc('car', 'evo', 'Ford', 'GP', 1), doc('layout', 'evo', 'Ferrari', 'Short', 1)]
    expect(vehicleSessionReferences(adapted, history, 'Unknown', 26, 50)).toMatchObject({ historicQualy: 100000, theoQualy: 100600 })
    const missing = vehicleSessionReferences(adapted, history, 'Unknown', Number.NaN, 50)
    expect(missing).toMatchObject({ historicQualy: 100000, theoQualy: null, theoRace: null })
    expect(missing.qualyReference.adjustmentMs).toBeNull()
    expect(vehicleSessionReferences(adapted, history, 'Optimum', 26, 50).historicQualy).toBeNull()
  })
})
