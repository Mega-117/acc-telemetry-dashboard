import { describe, expect, it } from 'vitest'
import { lapStatus, recordedNumber, sessionDataReferences, stintDataFacts } from '~/services/session-detail/sessionDataPresentation'
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
  it('distinguishes lost, partial, invalid and outlap records', () => {
    expect(lapStatus(lap({completeness:'missing'}))).toBe('Dati persi')
    expect(lapStatus(lap({validity:'unknown'}))).toBe('Validità non rilevata')
    expect(lapStatus(lap({is_valid:false,pit_out_lap:true,completeness:'partial'}))).toBe('Invalido · Uscita box · Parziale')
  })
})
