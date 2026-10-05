import { describe, expect, it } from 'vitest'
import { readCommonLive, commonBoolean, commonContextKey } from '~/services/telemetry/commonLive'
import { availabilityLabel, featureAvailability, TELEMETRY_FEATURES } from '~/services/telemetry/featureAvailability'
import { commonFastPresentation } from '~/services/telemetry/commonFastPresentation'

const source = () => ({ schema: 'racercore.live', version: 1, game_id: 'evo', session_id: 'heat-1',
  connected: true, observed_at_ms: 1000, ttl_ms: 1000, lifecycle: 'live', session_kind: 'race',
  identity: { track: 'Spa', variant: 'short', car: 'Electric' }, capabilities: { vehicle_inputs: true, fuel: false },
  fields: {
    speed: { value: 90, availability: 'available', unit: 'km/h' },
    rpm: { value: 9000, availability: 'available', unit: 'rpm' },
    gear: { value: 2, availability: 'available', unit: 'gear' },
    throttle: { value: .75, availability: 'available', unit: 'ratio' },
    brake: { value: 0, availability: 'available', unit: 'ratio' },
    fuel: { value: null, availability: 'unsupported', unit: 'L' },
    lap_valid: { value: 1, availability: 'available', unit: 'boolean' },
  } })

describe('per-feature multisim consumers', () => {
  it('routes measured EVO BB, stint, fuel and complete pressure averages without a fake tyre set', () => {
    const live = readCommonLive(source(), 1100)!
    for (const [name, value, unit] of [
      ['brake_bias', 58.8, '%'], ['stint_time_elapsed', 120000, 'ms'],
      ['fuel_time_remaining', 225000, 'ms'], ['fuel_reference_lap', 90000, 'ms'],
      ['pressure_average_lap', 5, 'count'],
      ...['FL','FR','RL','RR'].map(w => [`tyre.${w}.lap_pressure_average`, 26.8, 'psi']),
    ] as [string, number, string][]) live.fields[name] = { value, unit, availability: 'available' }
    const hud = commonFastPresentation(live)
    expect(hud.brakeBiasPct).toBe(58.8)
    expect(hud.info).toMatchObject({ stintTimeLeftMs: null, stintTimeElapsedMs: 120000, fuelLeftTimeMs: 225000, fuelLeftReferenceLapMs: 90000 })
    expect(hud.lapPressureAverage).toMatchObject({ status: 'available', lap: 5, tyreSet: null, values: { FL: 26.8, RR: 26.8 } })
    delete live.fields['tyre.RR.lap_pressure_average']
    expect(commonFastPresentation(live).lapPressureAverage?.status).toBe('waiting_for_full_lap')
    const expired = readCommonLive({ ...source(), fields: live.fields }, 3000)!
    expect(commonFastPresentation(expired).brakeBiasPct).toBeNull()
  })
  it('keeps motion, inputs and engine available when fuel and ACC rules are unsupported', () => {
    const live = readCommonLive(source(), 1100)!
    for (const key of ['speed', 'dashboardInputs', 'engine'] as const) expect(featureAvailability(live, TELEMETRY_FEATURES[key]).available).toBe(true)
    for (const key of ['fuel', 'pressureRecommendation', 'pitStrategy'] as const) expect(featureAvailability(live, TELEMETRY_FEATURES[key]).reason).toBe('unsupported')
    const hud = commonFastPresentation(live)
    expect(hud).toMatchObject({ speedKmh: 90, gas: .75, brake: 0, rpm: 9000, gear: 2, fuelL: null })
    expect(hud.context).toMatchObject({ track: 'Spa', variant: 'short', gameId: 'evo', sessionUid: 'heat-1', sessionType: null })
    expect(hud.lapValid).toBe(true)
    expect(hud.tyres).toEqual([])
  })
  it('distinguishes all unavailable states and rejects wrong units', () => {
    expect(featureAvailability(null, TELEMETRY_FEATURES.speed).reason).toBe('disconnected')
    const live = readCommonLive(source(), 1100)!
    expect(featureAvailability({ ...live, fresh: false }, TELEMETRY_FEATURES.speed).reason).toBe('stale')
    expect(featureAvailability({ ...live, connected: false }, TELEMETRY_FEATURES.speed).reason).toBe('disconnected')
    expect(featureAvailability(live, { fields: { missing: 'count' } }).reason).toBe('unknown')
    expect(featureAvailability(live, { fields: { fuel: 'L' } }).reason).toBe('unsupported')
    expect(featureAvailability(live, { fields: { speed: 'm/s' } }).reason).toBe('unit-mismatch')
    expect(featureAvailability({ ...live, fields: { speed: { value: null, availability: 'stale', unit: 'km/h' } } }, TELEMETRY_FEATURES.speed).reason).toBe('stale')
    for (const reason of ['available', 'disconnected', 'unsupported', 'unknown', 'stale', 'unit-mismatch'] as const) expect(availabilityLabel(reason)).toBeTruthy()
  })
  it('context includes game, session and variant without ambiguous concatenation', () => {
    const live = readCommonLive(source(), 1100)!
    const key = commonContextKey(live)
    expect(commonContextKey({ ...live, gameId: 'acc' })).not.toBe(key)
    expect(commonContextKey({ ...live, sessionId: 'heat-2' })).not.toBe(key)
    expect(commonContextKey({ ...live, identity: { ...live.identity!, variant: 'long' } })).not.toBe(key)
    expect(commonContextKey(null)).toBeNull()
  })
  it('does not interpret invalid booleans as true and keeps pause distinct from driving', () => {
    const raw = source()
    raw.fields.lap_valid.value = 2
    raw.lifecycle = 'paused'
    const live = readCommonLive(raw, 1100)!
    expect(commonBoolean(live, 'lap_valid')).toBeNull()
    expect(commonBoolean(live, 'missing')).toBeNull()
    expect(commonFastPresentation(live).isLive).toBe(false)
    raw.fields.lap_valid.value = 0
    expect(commonBoolean(readCommonLive(raw, 1100)!, 'lap_valid')).toBe(false)
  })
  it('preserves individual tyre gaps without fabricating the other wheels', () => {
    const live = readCommonLive(source(), 1100)!
    live.fields['tyre.FL.pressure'] = { value: 26.5, availability: 'available', unit: 'psi' }
    const hud = commonFastPresentation(live)
    expect(hud.tyres).toHaveLength(1)
    expect(hud.tyres?.[0]).toMatchObject({ id: 'FL', pressurePsi: 26.5, coreTempC: null })
  })
})
