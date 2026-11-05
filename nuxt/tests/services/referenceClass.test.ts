// dev.10 (user 05/11): the reference is chosen by the lap's class (kind, fuel band, weather), never empty,
// and the coach laps shipped with the program join the suggestions.
import { describe, expect, it } from 'vitest'
import { bandDistance, chooseDefaultReference, fuelBand, libraryClass, referencePickNote, traceClass, type LapEntryLike } from '~/services/telemetry/lapChoice'
import { pickReferences, type ReferenceConditions } from '~/services/telemetry/referencePick'
import { carClassOf, parseCoachIndex, pickCoachLaps, COACH_INDEX_SCHEMA } from '~/services/telemetry/coachLaps'
import { normalizeLapTrace } from '~/services/telemetry/lapTraceChart'
import type { LibraryEntry } from '~/services/telemetry/lapsArchiveClient'

const cond: ReferenceConditions = { grip: 'Optimum', airC: 22, roadC: 30, fuelL: 40 }
const lib = (id: string, uid: string, ms: number, stintFuelL: number | null, grip = 'Optimum'): LibraryEntry =>
  ({ libId: id.padEnd(24, '0'), uid, lapTimeMs: ms, recordedAt: null, grip, airC: 22, roadC: 30, fuelL: 30, stintFuelL })
const view = (extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({ schema: 'acc.laptrace.v1', grid_step_m: 2,
  meta: { track: 'monza', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: 106, complete: true, valid: true, fuel_l: 12, extra, ...meta },
  channels: { time_s: [0, 1], speed_kmh: [100, 110], brake_pct: [0, 0], throttle_pct: [100, 100], steer_deg: [0, 0], gear: [3, 3] } })

describe('lap class (dev.10)', () => {
  it('fuel bands, edges included', () => {
    expect([20, 20.1, 40, 40.1, 60, 80, 100, 100.1].map(fuelBand)).toEqual(['qualify', '20-40', '20-40', '40-60', '40-60', '60-80', '80-100', '100+'])
    expect([null, 0, Number.NaN].map(v => fuelBand(v as number | null))).toEqual([null, null, null])
    expect(bandDistance('40-60', '60-80')).toBe(1)
  })
  it('Codex 05/11: a race stint stays race at its 12th lap; the departure fuel survives the real JSON parser', () => {
    const trace = normalizeLapTrace(view({ stint_fuel_l: 85 }))!
    expect(trace.stintFuelL).toBe(85)
    expect(traceClass(trace)).toEqual({ kind: 'race', band: '80-100', wet: null })
    // Without the stint's fuel, the session row's, then the lap's own fuel.
    const bare = normalizeLapTrace(view())!
    expect(traceClass(bare, { stint_fuel: 55 }).band).toBe('40-60')
    expect(traceClass(bare).kind).toBe('qualify')
  })
  it('a replay lap knows no fuel: unknown kind, never a guess; wet from the grip or the tyres', () => {
    const replay = normalizeLapTrace(view({ coach: 'michaelromagnoli' }, { source: 'replay', fuel_l: null, fuel_uncertain: true }))!
    expect(replay.fuelUncertain).toBe(true)
    expect(replay.coach).toBe('michaelromagnoli')
    expect(traceClass(replay)).toEqual({ kind: null, band: null, wet: null })
    expect(traceClass({ fuelL: 50, conditions: { grip: 'Wet' } }).wet).toBe(true)
    expect(traceClass({ fuelL: 50, conditions: { grip: 'Optimum' } }).wet).toBe(false)
    expect(traceClass({ fuelL: 50, tyreCompound: 'wet', conditions: null }).wet).toBe(true)
  })
  it('a library entry: the Worker band and wet place, else its own fuel and grip', () => {
    expect(libraryClass(lib('a', 'u', 1, 85))).toEqual({ kind: 'race', band: '80-100', wet: false })
    expect(libraryClass({ ...lib('a', 'u', 1, null), fuelL: null })).toEqual({ kind: 'qualify', band: 'qualify', wet: false })
    expect(libraryClass(lib('a', 'u', 1, 30, 'Damp')).wet).toBe(true)
  })
})

describe('suggested reference: your class first, never empty (dev.10)', () => {
  const me = { kind: 'race' as const, band: '40-60' as const, wet: false }
  it('a driver of your kind, band and weather beats a closer time of another band', () => {
    const entries = [lib('a', 'u1', 101_800, 90), lib('b', 'u2', 101_600, 50)]
    const pick = pickReferences(entries, { myUid: 'me', myBestMs: 103_000, mine: cond, cls: me })
    expect(pick.suggested?.uid).toBe('u2')
    expect(pick.relaxed).toBeNull()
  })
  it('nobody in your band: the nearest band, and the reason says so', () => {
    const entries = [lib('a', 'u1', 101_800, 110), lib('b', 'u2', 101_700, 70)]
    const pick = pickReferences(entries, { myUid: 'me', myBestMs: 103_000, mine: cond, cls: me })
    expect(pick.suggested?.uid).toBe('u2')
    expect(pick.relaxed).toBe('band')
  })
  it('then the other weather, then the other kind; nobody quicker anywhere: no suggestion', () => {
    const wet = pickReferences([lib('a', 'u1', 101_800, 50, 'Wet')], { myUid: 'me', myBestMs: 103_000, mine: cond, cls: me })
    expect([wet.suggested?.uid, wet.relaxed]).toEqual(['u1', 'weather'])
    const quali = pickReferences([lib('a', 'u1', 101_800, 10)], { myUid: 'me', myBestMs: 103_000, mine: cond, cls: me })
    expect([quali.suggested?.uid, quali.relaxed]).toEqual(['u1', 'kind'])
    expect(pickReferences([lib('a', 'u1', 104_000, 50)], { myUid: 'me', myBestMs: 103_000, mine: cond, cls: me }).suggested).toBeNull()
  })
  it('a slower lap of your band does not stop the search: a quicker one of the next band is found', () => {
    const entries = [lib('a', 'u1', 104_000, 50), lib('b', 'u2', 101_900, 70)]
    expect(pickReferences(entries, { myUid: 'me', myBestMs: 103_000, mine: cond, cls: me }).relaxed).toBe('band')
  })
})

describe('coach laps (dev.10)', () => {
  const index = parseCoachIndex({ schema: COACH_INDEX_SCHEMA, coach: 'michaelromagnoli', laps: [
    { id: 'a'.repeat(16), track: 'monza', car: 'ferrari_296_gt3', carClass: 'GT3', lapTimeMs: 106_192, session: 'practice', rain: 0 },
    { id: 'b'.repeat(16), track: 'monza', car: 'ferrari_296_gt3', carClass: 'GT3', lapTimeMs: 105_900, session: 'qualifying', rain: 0 },
    { id: 'c'.repeat(16), track: 'monza', car: 'mercedes_amg_gt4', carClass: 'GT4', lapTimeMs: 118_000, session: 'practice', rain: 0 },
    { id: '../evil', track: 'monza', car: 'x', lapTimeMs: 1 },
  ] })
  it('reads the index and refuses unsafe ids', () => {
    expect(index?.laps.map(l => l.id[0])).toEqual(['a', 'b', 'c'])
    expect(parseCoachIndex({ schema: 'other', coach: 'x', laps: [] })).toBeNull()
  })
  it('the same car first, the qualifying replay for a qualifying lap; else the same class, said', () => {
    const quali = pickCoachLaps(index, { track: 'Monza', car: 'ferrari_296_gt3' }, { kind: 'qualify', band: 'qualify', wet: false })
    expect(quali[0]?.lap.id[0]).toBe('b')
    expect(quali[0]?.otherCar).toBe(false)
    const race = pickCoachLaps(index, { track: 'monza', car: 'ferrari_296_gt3' }, { kind: 'race', band: '40-60', wet: false })
    expect(race[0]?.lap.id[0]).toBe('a')
    const gt3 = pickCoachLaps(index, { track: 'monza', car: 'bmw_m4_gt3' }, null)
    expect(gt3.map(p => [p.lap.car, p.otherCar])).toEqual([['ferrari_296_gt3', true], ['ferrari_296_gt3', true]])
    expect(pickCoachLaps(index, { track: 'monza', car: 'alpine_a110_gt4' }, null)[0]?.lap.car).toBe('mercedes_amg_gt4')
    expect(pickCoachLaps(index, { track: 'spa', car: 'ferrari_296_gt3' }, null)).toEqual([])
    expect(carClassOf('alpine_a110_gt4')).toBe('GT4')
  })
})

describe('Codex review 05/11', () => {
  const e = (id: string, ms: number, extra: Partial<LapEntryLike> = {}): LapEntryLike => ({ id, lapNumber: 1, lapTimeMs: ms, valid: true, complete: true, origin: 'local', sessionToken: 't', ...extra })
  it('a driver of another kind never beats your own quicker lap of Tu\'s kind', () => {
    const you = e('you', 103_000), mine = [you, e('race', 102_500)]
    const kindOf = (id: string) => id === 'library:q' ? 'qualify' as const : 'race' as const
    const pick = chooseDefaultReference({ you, mine, stepUp: e('library:q', 101_800), stepUpRelaxed: 'kind', kindOf })
    expect(pick).toEqual({ id: 'race', reason: { kind: 'myBest' } })
    expect(chooseDefaultReference({ you, mine, stepUp: e('library:q', 101_800), stepUpRelaxed: 'band', kindOf })?.id).toBe('library:q')
  })
  it('no coach of "the same class" for a car whose class is not known (Cup, GT2)', () => {
    const index = parseCoachIndex({ schema: COACH_INDEX_SCHEMA, coach: 'c', laps: [
      { id: 'a'.repeat(16), track: 'monza', car: 'ferrari_296_gt3', carClass: 'GT3', lapTimeMs: 106_000, session: 'practice' }] })
    expect(carClassOf('porsche_992_gt3_cup')).toBeNull()
    expect(carClassOf('bmw_m4_gt3')).toBe('GT3')
    expect(carClassOf('porsche_935_gt2')).toBeNull()
    expect(pickCoachLaps(index, { track: 'monza', car: 'porsche_935_gt2' }, null)).toEqual([])
  })
  it('a lap whose steering is unknown has no steering channel (never a straight wheel)', () => {
    const trace = normalizeLapTrace(view({ steer_missing: true }, { source: 'replay' }))!
    expect(trace.channels.steer_deg).toBeUndefined()
    expect(normalizeLapTrace(view())!.channels.steer_deg).toBeDefined()
  })
})

describe('reference spy (dev.10, PIP-735)', () => {
  it('KO only when the kind differs from Tu while a lap of Tu\'s kind was there; unknown kinds never', () => {
    const step = { kind: 'stepUp' as const, driver: 'Bob', pct: 1, relaxed: 'kind' as const }
    expect(referencePickNote(step, 'race', 'qualify', true)).toEqual({ event: 'laps.reference_pick', origin: 1, relaxed: 3, kindWrong: 1 })
    expect(referencePickNote(step, 'race', 'qualify', false).kindWrong).toBe(0)
    expect(referencePickNote(step, 'race', null, true).kindWrong).toBe(0)
    expect(referencePickNote({ kind: 'coach', driver: 'c', session: null }, 'race', null, true)).toMatchObject({ origin: 2, relaxed: 0, kindWrong: 0 })
    expect(referencePickNote({ kind: 'picked' }, null, null, false).origin).toBe(6)
  })
})

describe('default reference order (dev.10)', () => {
  const e = (id: string, ms: number, extra: Partial<LapEntryLike> = {}): LapEntryLike => ({ id, lapNumber: 1, lapTimeMs: ms, valid: true, complete: true, origin: 'local', sessionToken: 't', ...extra })
  const you = e('you', 103_000)
  const mine = [you, e('best', 102_500)]
  it('the step ahead first, with what it relaxed; then the coach; then your best; then your theoretical lap', () => {
    const step = e('library:x', 101_800, { driver: 'Bob' })
    expect(chooseDefaultReference({ you, mine, stepUp: step, stepUpRelaxed: 'band' })?.reason).toEqual({ kind: 'stepUp', driver: 'Bob', pct: 1.2, relaxed: 'band' })
    const coach = { ...e('coach:a', 101_000, { driver: 'michaelromagnoli' }), coachSession: 'qualifying', coachOtherCar: false }
    expect(chooseDefaultReference({ you, mine, stepUp: null, coach })?.reason).toEqual({ kind: 'coach', driver: 'michaelromagnoli', session: 'qualifying', otherCar: null })
    expect(chooseDefaultReference({ you, mine, stepUp: null, coach: { ...coach, lapTimeMs: 104_000 } })?.id).toBe('best')
    expect(chooseDefaultReference({ you: e('you', 102_000), mine: [e('you', 102_000), e('s', 102_400)], stepUp: null, ideal: e('ideal', 101_700) })?.reason.kind).toBe('ideal')
  })
})
