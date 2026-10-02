import { describe, expect, it } from 'vitest'
import { commonSessionAnalysis } from '~/services/telemetry/commonSessionAnalysis'
import { trainingAvailability, TRAINING_REQUIREMENTS } from '~/services/telemetry/trainingAvailability'
import type { CommonLive } from '~/services/telemetry/commonLive'
const lap = (time: number, sectors: number[] = []) => ({ lap_time_ms: time, sector_times_ms: sectors,
  completeness: 'complete', validity: 'valid', is_valid: true })
const session = (laps: unknown[]) => ({ schema: 'racercore.session', version: 1, game_id: 'synthetic', stints: [{ laps }] })

describe('recorded common analysis', () => {
  it('uses only complete explicitly valid laps, preserving mathematical statistics', () => {
    const result = commonSessionAnalysis(session([lap(100000, [50000, 50000]), lap(102000, [49000, 53000]),
      { ...lap(100), validity: 'unknown', is_valid: null }, { ...lap(200), completeness: 'partial' },
      { ...lap(300), is_valid: false }, lap(NaN)]))!
    expect(result).toMatchObject({ recordedLaps: 6, eligibleLaps: 2, bestMs: 100000, averageMs: 101000,
      consistencyMs: 1000, theoreticalMs: 99000, bestSectorsMs: [49000, 50000] })
  })
  it('handles zero, two, three and four sectors; mixed or incomplete timing has no theoretical lap', () => {
    for (const count of [0, 2, 3, 4]) {
      expect(commonSessionAnalysis(session([lap(120000, Array(count).fill(120000 / count))]))!.bestSectorsMs).toHaveLength(count)
    }
    for (const laps of [[lap(100, [30, 30])], [lap(100, [50, 50]), lap(120, [40, 40, 40])], [lap(100, [0, 100])], []]) {
      expect(commonSessionAnalysis(session(laps))!.theoreticalMs).toBeNull()
    }
    expect(commonSessionAnalysis(session([]))!.bestMs).toBeNull()
    expect(commonSessionAnalysis(session([lap(100)]))!.consistencyMs).toBeNull()
    for (const raw of [null, {}, { ...session([]), version: 2 }, { ...session([]), game_id: '../acc' }]) expect(commonSessionAnalysis(raw)).toBeNull()
  })
})
describe('each training uses its own data requirements', () => {
  it('supports all five exercises without fuel or ACC rules and degrades selectively', () => {
    const source: CommonLive = { gameId: 'synthetic', sessionId: '1', connected: true, fresh: true,
      capabilities: { lap_timing: true, lap_validity: true, vehicle_inputs: true, track_position: true },
      fields: Object.fromEntries(Object.entries({ throttle: 'ratio', brake: 'ratio', normalized_position: 'ratio',
        lap_count: 'count', lap_valid: 'boolean', current_lap_time: 'ms' }).map(([name, unit]) => [name, { value: 1, availability: 'available', unit }])) }
    for (const mode of Object.keys(TRAINING_REQUIREMENTS) as (keyof typeof TRAINING_REQUIREMENTS)[]) expect(trainingAvailability(source, mode).available).toBe(true)
    delete source.fields.brake
    expect(trainingAvailability(source, 'tracktitan_input').reason).toBe('unknown')
    expect(trainingAvailability(source, 'clean_laps').available).toBe(true)
    source.capabilities.lap_validity = false
    expect(trainingAvailability(source, 'qualifying').reason).toBe('unsupported')
    expect(trainingAvailability(source, 'race_real').available).toBe(true)
    expect(trainingAvailability({ ...source, fresh: false }, 'race_real').reason).toBe('stale')
  })
})
