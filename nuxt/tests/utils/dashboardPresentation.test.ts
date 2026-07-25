import { describe, expect, it } from 'vitest'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import {
  buildDashboardPresentation,
  DEFAULT_DASHBOARD_OPTIONS,
  normalizeFuelCriticalLapsThreshold,
  normalizeShiftRpmThreshold,
} from '~/utils/dashboardPresentation'

function state(overrides: Partial<FastOverlayState> = {}): FastOverlayState {
  return {
    isFresh: true, isLive: true, ignitionOn: true, isEngineRunning: true, pitLimiterOn: false,
    sessionType: 2, normalizedCarPosition: 0.4, speedKmh: 123.4, speedDeltaKmh: null,
    referenceSpeedKmh: null, referenceRpm: null, referenceGear: null,
    referenceEngineMap: null, referenceTractionControl: null,
    referenceTractionControl2: null, referenceAbs: null,
    gas: 0.7, brake: 0.2, rpm: 7800, maxRpm: 9000, gear: 3,
    fuelL: 42.35, fuelPerLapL: 2.71, fuelLapsRemaining: 15.6, fuelLeftTimeMs: 531_001, sessionLapsRemaining: 8,
    sessionTimeLeftMs: 1000, engineMap: 2, tractionControl: 3, tractionControl2: 1,
    abs: 4, brakeBiasPct: 54.8, cornerSpeedKmh: null,
    directionLightsLeft: false, directionLightsRight: false, lightsStage: 1, rainLights: false,
    currentTyreSet: null, tyreSetAvailable: false, tyreCompound: null,
    rainIntensity: null, rainIntensity10Min: null, rainIntensity30Min: null,
    lapPressureAverage: { status: 'waiting_for_full_lap', lap: null, tyreSet: null, values: { FL: null, FR: null, RL: null, RR: null } },
    trackReferencePhase: null, trackReferencesEligible: false, tyres: [],
    ...overrides,
  }
}

describe('dashboardPresentation', () => {
  it('formatta i dati e la convenzione marce R/N/1+', () => {
    expect(buildDashboardPresentation(state({ gear: -1 })).gear).toBe('R')
    expect(buildDashboardPresentation(state({ gear: 0 })).gear).toBe('N')
    const model = buildDashboardPresentation(state())
    expect(model).toMatchObject({ ignitionLabel: '7800', speed: '123', fuelPerLap: '2.71', brakeBias: '54.8' })
    expect(model.remainingLabel).toBe('Laps Left')
    expect(model.remainingValue).toBe('15.6')
    expect(model.fuelLeft).toBe('0:08:51')
  })

  it('degrada i campi mancanti senza inventare dati', () => {
    const model = buildDashboardPresentation(state({
      ignitionOn: false, isEngineRunning: false, gear: null, fuelL: null,
      fuelPerLapL: null, fuelLapsRemaining: null, fuelLeftTimeMs: null, sessionLapsRemaining: null,
      sessionTimeLeftMs: null,
    }))
    expect(model).toMatchObject({
      ignitionLabel: 'IGNITION OFF', gear: '-', fuel: '--.-',
      fuelPerLap: '--.--', fuelLeft: '-:--:--', lapsLeft: '--.-',
    })
    expect(model.rpmReferenceRatio).toBeNull()
  })

  it('usa sempre autonomia carburante per Laps Left e Fuel Left', () => {
    const model = buildDashboardPresentation(state({
      fuelLapsRemaining: 3.9,
      fuelLeftTimeMs: 531_001,
      sessionLapsRemaining: null,
      sessionTimeLeftMs: 1_845_500,
    }))
    expect(model.remainingLabel).toBe('Laps Left')
    expect(model.remainingValue).toBe('3.9')
    expect(model.fuelLeft).toBe('0:08:51')
  })

  it('propaga limiter, indicatori e luci con stage normalizzato', () => {
    expect(buildDashboardPresentation(state({
      pitLimiterOn: true,
      directionLightsLeft: true,
      directionLightsRight: true,
      lightsStage: 8,
      rainLights: true,
    }))).toMatchObject({
      pitLimiterOn: true, leftIndicatorActive: true, rightIndicatorActive: true,
      lightsStage: 2, rainLightsActive: true,
    })
  })

  it('lampeggia solo a stato fresco sopra la soglia configurata', () => {
    expect(buildDashboardPresentation(state({ rpm: 8199 }), DEFAULT_DASHBOARD_OPTIONS).shiftFlash).toBe(false)
    expect(buildDashboardPresentation(state({ rpm: 8200 }), DEFAULT_DASHBOARD_OPTIONS).shiftFlash).toBe(true)
    expect(buildDashboardPresentation(state({ rpm: 9000, isFresh: false }), DEFAULT_DASHBOARD_OPTIONS).shiftFlash).toBe(false)
    expect(buildDashboardPresentation(state({ rpm: 9000, isLive: false }), DEFAULT_DASHBOARD_OPTIONS).shiftFlash).toBe(false)
    expect(buildDashboardPresentation(state({ rpm: 9000 }), { ...DEFAULT_DASHBOARD_OPTIONS, shiftFlashEnabled: false }).shiftFlash).toBe(false)
  })

  it('usa esclusivamente la soglia manuale per il flash, mai il riferimento RPM', () => {
    const options = { ...DEFAULT_DASHBOARD_OPTIONS, shiftRpmThreshold: 7000 }
    expect(buildDashboardPresentation(state({ rpm: 6999, referenceRpm: 9000 }), options).shiftFlash).toBe(false)
    expect(buildDashboardPresentation(state({ rpm: 7000, referenceRpm: 1000 }), options).shiftFlash).toBe(true)
    expect(buildDashboardPresentation(state({ rpm: 9000, referenceRpm: 1000 }), { ...options, shiftFlashEnabled: false }).shiftFlash).toBe(false)
  })

  it('rende osservabili e disattivabili tutti i riferimenti del giro migliore', () => {
    const withReferences = state({
      speedDeltaKmh: 2.14, referenceRpm: 7600, referenceGear: 4,
      referenceEngineMap: 1, referenceTractionControl: 2,
      referenceTractionControl2: 3, referenceAbs: 4,
    })
    expect(buildDashboardPresentation(withReferences)).toMatchObject({
      speedDelta: null, gearReference: null, engineMapReference: null,
      tractionControlReference: null, tractionControl2Reference: null,
      absReference: null, rpmReferenceRatio: null, shiftThresholdRatio: null,
    })
    expect(buildDashboardPresentation(withReferences, {
      ...DEFAULT_DASHBOARD_OPTIONS, electronicsReference: true, rpmReference: true,
      gearReference: true, speedDelta: true,
    })).toMatchObject({
      speed: '123', speedDelta: '2.1', speedDeltaFaster: true,
      gearReference: '4', engineMapReference: '1', tractionControlReference: '2',
      tractionControl2Reference: '3', absReference: '4',
    })
    expect(buildDashboardPresentation(withReferences, {
      ...DEFAULT_DASHBOARD_OPTIONS, electronicsReference: false,
      gearReference: false, rpmReference: false, speedDelta: false,
    })).toMatchObject({
      speedDelta: null, gearReference: null, engineMapReference: null,
      tractionControlReference: null, tractionControl2Reference: null,
      absReference: null, rpmReferenceRatio: null,
    })
  })

  it('replica le fasce colore RPM di ACC Drive attorno alla soglia configurata', () => {
    expect(buildDashboardPresentation(state({ ignitionOn: false, isEngineRunning: false })).rpmBand).toBe('off')
    expect(buildDashboardPresentation(state({ pitLimiterOn: true })).rpmBand).toBe('pit')
    expect(buildDashboardPresentation(state({ rpm: 7400 })).rpmBand).toBe('green')
    expect(buildDashboardPresentation(state({ rpm: 8199 })).rpmBand).toBe('green')
    expect(buildDashboardPresentation(state({ rpm: 8200 })).rpmBand).toBe('blue')
    expect(buildDashboardPresentation(state({ rpm: 8200 }), {
      ...DEFAULT_DASHBOARD_OPTIONS,
      shiftFlashEnabled: false,
    }).rpmBand).toBe('blue')
    const custom = { ...DEFAULT_DASHBOARD_OPTIONS, shiftRpmThreshold: 7000 }
    expect(buildDashboardPresentation(state({ rpm: 6999 }), custom).rpmBand).toBe('green')
    expect(buildDashboardPresentation(state({ rpm: 7000 }), custom).rpmBand).toBe('blue')
  })

  it('applica un solo stato di urgenza carburante ai tre indicatori', () => {
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 1.1 })).fuelUrgency).toBe('normal')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 1 })).fuelUrgency).toBe('low')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.6 })).fuelUrgency).toBe('low')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.5 })).fuelUrgency).toBe('critical')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: null })).fuelUrgency).toBe('normal')
  })

  it('fa pulsare il bordo solo nello stato critico e quando abilitato', () => {
    const enabled = { ...DEFAULT_DASHBOARD_OPTIONS, fuelCriticalFlashEnabled: true }
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.6 }), enabled).fuelCriticalPulse).toBe(false)
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.5 }), enabled).fuelCriticalPulse).toBe(true)
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.4 })).fuelCriticalPulse).toBe(false)
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.4, isFresh: false }), enabled))
      .toMatchObject({ fuelUrgency: 'normal', fuelCriticalPulse: false })
    expect(buildDashboardPresentation(state({
      fuelLapsRemaining: 0.4, ignitionOn: false, isEngineRunning: false,
    }), enabled)).toMatchObject({ fuelUrgency: 'normal', fuelCriticalPulse: false })
  })

  it('normalizza la soglia RPM entro limiti sicuri', () => {
    expect(normalizeShiftRpmThreshold('bad')).toBe(8200)
    expect(normalizeShiftRpmThreshold(200)).toBe(1000)
    expect(normalizeShiftRpmThreshold(25000)).toBe(20000)
    expect(normalizeFuelCriticalLapsThreshold('bad')).toBe(0.5)
    expect(normalizeFuelCriticalLapsThreshold(0)).toBe(0.1)
    expect(normalizeFuelCriticalLapsThreshold(4)).toBe(1)
  })
})
