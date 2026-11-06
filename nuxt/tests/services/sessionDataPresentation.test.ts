import { describe, expect, it } from 'vitest'
import { lapStatus, recordedNumber, sessionDataCheck, sessionSettled, SETTLED_AFTER_MS, sessionDataReferences, stintDataFacts, stintEndFacts } from '~/services/session-detail/sessionDataPresentation'
import type { FullSession, LapData, StintData } from '~/types/telemetry'

const lap = (overrides = {}): LapData => ({ lap_number: 1, lap_time_ms: 90000, elapsed_time_ms: 90000, fuel_start: 50, fuel_remaining: 47,
  air_temp: 20, road_temp: 30, rain_intensity: 'No Rain', track_grip_status: 'Optimum', is_valid: true,
  is_first_stint_lap: false, has_pit_stop: false, pit_out_lap: false, sectors_reliable: true, sector_times_ms: [30000,30000,30000], ...overrides })
describe('DATI recorded session facts', () => {
  it('does not turn missing measurements into zero', () => {
    expect(recordedNumber(null)).toBeNull(); expect(recordedNumber(undefined)).toBeNull()
    expect(recordedNumber(NaN)).toBeNull(); expect(recordedNumber(0)).toBe(0)
    expect(sessionDataReferences(null)).toEqual({best:null,optimal:null,average:null})
  })
  it('excludes invalid, box and unreliable sectors from session references', () => {
    const session = { session_info: {avg_clean_lap: 91000}, stints: [{ laps: [lap(), lap({lap_time_ms: 80000, is_valid:false}), lap({lap_time_ms:70000,pit_out_lap:true}), lap({lap_time_ms:85000,sectors_reliable:false,sector_times_ms:[1,1,1]})] }] } as FullSession
    expect(sessionDataReferences(session)).toEqual({best:85000, optimal:90000, average:91000})
  })
  it('measures only recorded stint laps and rejects refueling/missing fuel', () => {
    const stint = {stint_drive_time_ms:180000,laps:[lap(),lap({fuel_start:47,fuel_remaining:44,is_valid:false})]} as StintData
    expect(stintDataFacts(stint)).toMatchObject({consumed:6,perLap:3,lapCount:2,duration:180000})
    expect(stintDataFacts({...stint,laps:[lap({fuel_remaining:60})]}).consumed).toBeNull()
    expect(stintDataFacts(undefined).perLap).toBeNull()
  })
  // 02/11 (ACC Drive TELEMETRY): the bottom row is the stint's, whatever lap is selected.
  it('gives stint start and end temperatures, end-of-stint damage and the stint pressure loss', () => {
    const tel = (loss: (number | null)[], body: number) => ({ pressure: { high: [0, 0, 0, 0], avg: [0, 0, 0, 0], loss }, damage: { body, suspension: 0 } })
    const session = { session_info: { start_air_temp: 15, start_road_temp: 18 }, stints: [
      { stint_number: 1, laps: [lap({ air_temp: 15.5, road_temp: 19, telemetry: tel([0.1, 0, null, 0], 0) }), lap({ air_temp: 16, road_temp: 20, telemetry: tel([0.05, 0.2, null, 0], 3000) })] },
      { stint_number: 2, laps: [lap({ air_temp: 17, road_temp: 22 }), lap({ air_temp: 16.5, road_temp: 21 })] },
    ] } as unknown as FullSession
    const first = stintEndFacts(session, 1)
    expect(first).toMatchObject({ startAir: 15, startTrack: 18, endAir: 16, endTrack: 20, damageBody: 3000, damageSuspension: 0 })
    expect(first.pressureLoss[0]).toBeCloseTo(0.15)
    expect(first.pressureLoss.slice(1)).toEqual([0.2, null, 0])
    // A later stint starts where the previous one ended.
    expect(stintEndFacts(session, 2)).toMatchObject({ startAir: 16, startTrack: 20, endAir: 16.5, endTrack: 21, damageBody: null })
    expect(stintEndFacts(null, 1).pressureLoss).toEqual([null, null, null, null])
  })
  it('distinguishes lost, partial, invalid and outlap records', () => {
    expect(lapStatus(lap({completeness:'missing'}))).toBe('Dati persi')
    expect(lapStatus(lap({validity:'unknown'}))).toBe('Validità non rilevata')
    expect(lapStatus(lap({is_valid:false,pit_out_lap:true,completeness:'partial'}))).toBe('Invalido · Uscita box · Parziale')
  })
})

// PIP-743: the laps the Dati page draws against the logger's counters and the Sessioni list summary.
describe('Dati page data check', () => {
  const session = (laps: LapData[], info = {}) => ({ session_info: { laps_total: laps.length, laps_valid: laps.filter(l => l.is_valid).length, ...info }, stints: [{ laps }] }) as unknown as FullSession
  it('the same laps everywhere: nothing off', () => {
    const laps = [lap(), lap({ lap_number: 2, lap_time_ms: 89000 }), lap({ lap_number: 3, is_valid: false })]
    expect(sessionDataCheck(session(laps), { laps: 3, lapsValid: 2, bestLap: 89000 })).toEqual({ laps: 3, lapsOff: 0, validOff: 0, off: 0, bestOff: 0 })
  })
  it('a lap lost on the way shows against the logger and the list', () => {
    const laps = [lap(), lap({ lap_number: 2 })]
    expect(sessionDataCheck(session(laps, { laps_total: 3, laps_valid: 3 }), null)).toMatchObject({ lapsOff: 1, validOff: 1, off: 1 })
    expect(sessionDataCheck(session(laps), { laps: 4, lapsValid: 2 })).toMatchObject({ lapsOff: 2, validOff: 0 })
  })
  it('a best different from the list is information; missing counts are not compared', () => {
    expect(sessionDataCheck(session([lap()]), { bestLap: 88000 })).toMatchObject({ lapsOff: 0, bestOff: 1 })
    expect(sessionDataCheck(session([lap()], { laps_total: undefined, laps_valid: null }), undefined)).toMatchObject({ lapsOff: 0, validOff: 0 })
    expect(sessionDataCheck(null, null)).toBeNull()
  })
})

describe('Dati check only on a settled session (Codex 06/11)', () => {
  const end = '2026-11-06T12:00:00.000Z', at = Date.parse(end)
  it('same save, no save for 10 minutes: settled', () => {
    expect(sessionSettled(end, end, at + SETTLED_AFTER_MS)).toBe(true)
  })
  it('a lap saved meanwhile, a recent save or no end: not settled', () => {
    expect(sessionSettled(end, '2026-11-06T12:01:50.000Z', at + SETTLED_AFTER_MS * 2)).toBe(false)
    expect(sessionSettled(end, end, at + 60_000)).toBe(false)
    expect(sessionSettled(null, null, at)).toBe(false)
    expect(sessionSettled('nonsense', 'nonsense', at)).toBe(false)
  })
})
