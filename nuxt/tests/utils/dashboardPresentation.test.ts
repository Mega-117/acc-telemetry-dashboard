import { describe, expect, it } from 'vitest'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import type { StandingsCarSnapshot } from '~/services/overlay/standingsPresentation'
import { emptyTyreSetupViewModel } from '~/services/overlay/tyreSetupViewModel'
import {
  buildDashboardPresentation,
  DEFAULT_DASHBOARD_OPTIONS,
  normalizeFuelCriticalLapsThreshold,
} from '~/utils/dashboardPresentation'

const EXPECTED_SHIFT_RPM = {
  lamborghini_huracan_gt3_evo2: 8000,
  porsche_992_gt3_r: 9000,
  ferrari_296_gt3: 7300,
  audi_r8_lms_evo_ii: 8000,
  mercedes_amg_gt3_evo: 7150,
  bmw_m4_gt3: 7000,
  amr_v8_vantage_gt3: 6800,
  honda_nsx_gt3_evo: 11740,
  mclaren_720s_gt3: 7550,
  bentley_continental_gt3_2018: 7000,
  lexus_rc_f_gt3: 7700,
} as const

function context(car = 'porsche_992_gt3_r', sessionIndex = 1): FastOverlayState['context'] {
  return {
    track: 'monza', car, sessionType: 2, sessionIndex,
    sessionUid: `session-${sessionIndex}`, serverId: null,
  }
}

function state(overrides: Partial<FastOverlayState> = {}): FastOverlayState {
  return {
    context: context(), info: null, flag: null, lapsCompleted: 0,
    currentLapTimeMs: null, lastLapTimeMs: null, bestLapTimeMs: null, lapValid: true,
    isFresh: true, isLive: true, ignitionOn: true, isEngineRunning: true, pitLimiterOn: false, isInPitLane: false,
    sessionType: 2, normalizedCarPosition: 0.4, speedKmh: 123.4, speedDeltaKmh: null,
    referenceSpeedKmh: null, referenceRpm: null, referenceGear: null,
    referenceEngineMap: null, referenceTractionControl: null,
    referenceTractionControl2: null, referenceAbs: null,
    gas: 0.7, brake: 0.2, rpm: 7800, maxRpm: 12000, gear: 3,
    fuelL: 42.35, fuelPerLapL: 2.71, fuelLapsRemaining: 15.6, fuelLeftTimeMs: 531_001,
    sessionLapsRemaining: 8, sessionTimeLeftMs: 1000, engineMap: 2,
    tractionControl: 3, tractionControl2: 1, abs: 4, tractionControlInAction: false, absInAction: false, brakeBiasPct: 54.8,
    cornerSpeedKmh: null, cornerSpeedDeltaKmh: null, cornerSpeedMode: 'empty',
    directionLightsLeft: false, directionLightsRight: false,
    lightsStage: 1, rainLights: false, currentTyreSet: null, tyreSetAvailable: false,
    tyreCompound: null, rainIntensity: null, rainIntensity10Min: null, rainIntensity30Min: null,
    lapPressureAverage: {
      status: 'waiting_for_full_lap', lap: null, tyreSet: null,
      values: { FL: null, FR: null, RL: null, RR: null },
    },
    tyreSetup: emptyTyreSetupViewModel(),
    trackReferencePhase: null, trackReferencesEligible: false, tyres: [],
    ...overrides,
  }
}

function focusedCar(): StandingsCarSnapshot {
  return {
    car_index: 1024,
    car_class: null,
    race_number: 16,
    current_driver_index: 0,
    drivers: [{ first_name: 'Jakub', last_name: 'Ivanko' }],
    position: 1,
    laps: 3,
    spline_position: 0.812,
    kmh: 239,
    gear: 5,
    current_lap_ms: 93_556,
    current_lap: { time_ms: 93_556, splits_ms: [30_000, null, null], is_invalid: false },
    last_lap_ms: 112_267,
    last_lap: { time_ms: 112_267, splits_ms: [36_000, 37_000, 39_267], is_invalid: true },
    best_lap_ms: 110_912,
    best_lap: { time_ms: 110_912, splits_ms: [35_000, 36_000, 39_912], is_invalid: false },
    has_identity: true,
    has_realtime: true,
  }
}

describe('dashboardPresentation', () => {
  it('formatta i dati e la convenzione marce R/N/1+', () => {
    expect(buildDashboardPresentation(state({ gear: -1 })).gear).toBe('R')
    expect(buildDashboardPresentation(state({ gear: 0 })).gear).toBe('N')
    const model = buildDashboardPresentation(state())
    expect(model).toMatchObject({ ignitionLabel: '7800', speed: '123', fuelPerLap: '2.71', brakeBias: '54.8' })
    expect(model.spectator).toBeNull()
    expect(model.remainingLabel).toBe('Laps Left')
    expect(model.remainingValue).toBe('15.6')
    expect(model.fuelLeft).toBe('0:08:51')
  })

  it('degrada i campi mancanti senza inventare dati', () => {
    const model = buildDashboardPresentation(state({
      ignitionOn: false, isEngineRunning: false, gear: null, fuelL: null,
      fuelPerLapL: null, fuelLapsRemaining: null, fuelLeftTimeMs: null,
      sessionLapsRemaining: null, sessionTimeLeftMs: null,
    }))
    expect(model).toMatchObject({
      ignitionLabel: 'IGNITION OFF', gear: '-', fuel: '--.-',
      fuelPerLap: '--.--', fuelLeft: '-:--:--', lapsLeft: '--.-', shiftFlash: false,
    })
    expect(model.rpmReferenceRatio).toBeNull()
  })
  it('mostra tutti e soli i dati UDP provati del pilota osservato', () => {
    const model = buildDashboardPresentation(state({
      dataSource: 'focused', ignitionOn: false, isEngineRunning: false,
      speedKmh: 239, gear: 5, lapsCompleted: 3, normalizedCarPosition: 0.812,
      currentLapTimeMs: 93_556, lastLapTimeMs: 112_267, bestLapTimeMs: 110_912,
      sessionTimeLeftMs: 732_000, gas: null, brake: null, rpm: null, maxRpm: null,
      fuelL: null, fuelPerLapL: null, fuelLapsRemaining: null, fuelLeftTimeMs: null,
      engineMap: null, tractionControl: null, tractionControl2: null, abs: null,
      brakeBiasPct: null, cornerSpeedKmh: null,
    }), DEFAULT_DASHBOARD_OPTIONS, focusedCar())

    expect(model).toMatchObject({
      ignitionLabel: '—', speed: '239', gear: '5', fuel: '--.-',
      fuelPerLap: '--.--', engineMap: '-', tractionControl: '-', tractionControl2: '-',
      abs: '-', brakeBias: '--.-', cornerSpeed: '-', inputsAvailable: false,
      rpmRatio: 0, rpmReferenceRatio: null, shiftThresholdRatio: null, shiftFlash: false,
      spectator: {
        driverName: 'J. Ivanko', carLabel: '#16', position: 'P1', laps: '3',
        progress: '81.2%', session: 'RACE · 12:12',
      },
    })
    expect(model.spectator?.timings).toEqual([
      { label: 'CURRENT', lapTime: '1:33.556', splits: ['0:30.000', '—', '—'], validity: 'VALID' },
      { label: 'LAST', lapTime: '1:52.267', splits: ['0:36.000', '0:37.000', '0:39.267'], validity: 'INVALID' },
      { label: 'BEST', lapTime: '1:50.912', splits: ['0:35.000', '0:36.000', '0:39.912'], validity: 'VALID' },
    ])
  })

  it('mantiene il ramo spectator ma azzera i selected values quando il feed diventa stale', () => {
    const model = buildDashboardPresentation(state({
      dataSource: 'focused', speedKmh: null, gear: null, normalizedCarPosition: null,
      currentLapTimeMs: null, lastLapTimeMs: null, bestLapTimeMs: null,
      sessionTimeLeftMs: null, gas: null, brake: null,
    }), DEFAULT_DASHBOARD_OPTIONS, null)

    expect(model).toMatchObject({ speed: '—', gear: '—' })
    expect(model.spectator).toMatchObject({
      driverName: '—', carLabel: 'CAR —', position: 'P—', laps: '—', progress: '—', session: 'RACE',
    })
    expect(model.spectator?.timings.every(timing => timing.lapTime === '—')).toBe(true)
  })


  it.each(Object.entries(EXPECTED_SHIFT_RPM))(
    'usa per %s la soglia verificata %i senza fallback',
    (car, threshold) => {
      expect(buildDashboardPresentation(state({ context: context(car), rpm: threshold - 1 })).shiftFlash).toBe(false)
      const atThreshold = buildDashboardPresentation(state({ context: context(car), rpm: threshold }))
      expect(atThreshold.shiftFlash).toBe(true)
      expect(atThreshold.rpmBand).toBe('blue')
    },
  )

  it.each([
    'bentley_continental_gt3_2016',
    'porsche_718_cayman_gt4_mr',
    'porsche_992_gt3_cup',
    'mclaren_720s_gt3_evo',
    'future_gt3',
    'Ferrari 296 GT3',
  ])('non lampeggia e non mostra il marker per auto non mappata: %s', (car) => {
    const model = buildDashboardPresentation(
      state({ context: context(car), rpm: 20000 }),
      { ...DEFAULT_DASHBOARD_OPTIONS, rpmReference: true },
    )
    expect(model.shiftFlash).toBe(false)
    expect(model.rpmBand).toBe('green')
    expect(model.shiftThresholdRatio).toBeNull()
  })

  it('ricalcola la soglia sullo snapshot corrente quando cambiano auto e sessione', () => {
    expect(buildDashboardPresentation(state({
      context: context('ferrari_296_gt3', 1), rpm: 7300,
    })).shiftFlash).toBe(true)
    expect(buildDashboardPresentation(state({
      context: context('honda_nsx_gt3_evo', 2), rpm: 7300,
    })).shiftFlash).toBe(false)
    expect(buildDashboardPresentation(state({
      context: context('honda_nsx_gt3_evo', 2), rpm: 11740,
    })).shiftFlash).toBe(true)
    expect(buildDashboardPresentation(state({
      context: context('bentley_continental_gt3_2016', 3), rpm: 11740,
    })).shiftFlash).toBe(false)
  })

  it('non lampeggia con telemetria o RPM mancanti e invalidi', () => {
    const invalidStates: Array<Partial<FastOverlayState>> = [
      { context: null, rpm: 12000 },
      { rpm: null },
      { rpm: Number.NaN },
      { rpm: Number.POSITIVE_INFINITY },
      { rpm: -1 },
      { isFresh: false, rpm: 12000 },
      { isLive: false, rpm: 12000 },
      { ignitionOn: false, rpm: 12000 },
      { isEngineRunning: false, rpm: 12000 },
    ]
    for (const invalid of invalidStates) {
      expect(buildDashboardPresentation(state(invalid)).shiftFlash).toBe(false)
    }
  })

  it('mantiene il marker esistente sulla soglia automatica solo per auto mappate', () => {
    const mapped = buildDashboardPresentation(
      state({ context: context('ferrari_296_gt3'), rpm: 7000, maxRpm: 10000 }),
      { ...DEFAULT_DASHBOARD_OPTIONS, rpmReference: true },
    )
    expect(mapped.shiftThresholdRatio).toBe(0.73)

    const hidden = buildDashboardPresentation(
      state({ context: context('bentley_continental_gt3_2016'), maxRpm: 10000 }),
      { ...DEFAULT_DASHBOARD_OPTIONS, rpmReference: true },
    )
    expect(hidden.shiftThresholdRatio).toBeNull()
  })

  it('rende osservabili e disattivabili i riferimenti del giro migliore', () => {
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
  })

  it('replica ACC Drive: riempie solo il riquadro dell intervento reale ABS o TC', () => {
    expect(buildDashboardPresentation(state({ tractionControlInAction: true })))
      .toMatchObject({ tractionControlActive: true, absActive: false })
    expect(buildDashboardPresentation(state({ absInAction: true })))
      .toMatchObject({ tractionControlActive: false, absActive: true })
    expect(buildDashboardPresentation(state({ tractionControlInAction: true, absInAction: true })))
      .toMatchObject({ tractionControlActive: true, absActive: true })
  })

  it('separa warning TC zero e intervento reale anche a motore spento', () => {
    expect(buildDashboardPresentation(state({ tractionControl: 0 })))
      .toMatchObject({ tractionControlOffWarning: true, tractionControlActive: false })
    expect(buildDashboardPresentation(state({ tractionControl: 6, ignitionOn: false, isEngineRunning: false })))
      .toMatchObject({ tractionControlOffWarning: false, tractionControlActive: false })
  })

  it('mostra delta Corner Speed con tono producer-owned e poi assoluto', () => {
    expect(buildDashboardPresentation(state({
      cornerSpeedKmh: 86, cornerSpeedDeltaKmh: 4, cornerSpeedMode: 'delta',
    }))).toMatchObject({ cornerSpeed: '4', cornerSpeedTone: 'faster' })
    expect(buildDashboardPresentation(state({
      cornerSpeedKmh: 86, cornerSpeedDeltaKmh: -3, cornerSpeedMode: 'delta',
    }))).toMatchObject({ cornerSpeed: '-3', cornerSpeedTone: 'slower' })
    expect(buildDashboardPresentation(state({
      cornerSpeedKmh: 86, cornerSpeedDeltaKmh: null, cornerSpeedMode: 'absolute',
    }))).toMatchObject({ cornerSpeed: '86', cornerSpeedTone: 'neutral' })
    expect(buildDashboardPresentation(state())).toMatchObject({ cornerSpeed: '0' })
  })

  it('sostituisce gli RPM con PIT LIMITER ON quando il limiter e attivo', () => {
    expect(buildDashboardPresentation(state({ pitLimiterOn: true })))
      .toMatchObject({ ignitionLabel: 'PIT LIMITER ON', rpmBand: 'pit' })
  })

  it.each([
    { isFresh: false }, { isLive: false }, { ignitionOn: false }, { isEngineRunning: false }, { isInPitLane: true },
  ])('does not show intervention effects with unreliable or non-driving telemetry: %o', (invalid) => {
    const model = buildDashboardPresentation(state({ tractionControlInAction: true, absInAction: true, ...invalid }))
    expect(model).toMatchObject({ tractionControlActive: false, absActive: false })
  })


  it('mantiene precedenza off e pit e usa la soglia auto per verde/blu', () => {
    expect(buildDashboardPresentation(state({ ignitionOn: false, isEngineRunning: false })).rpmBand).toBe('off')
    expect(buildDashboardPresentation(state({ pitLimiterOn: true })).rpmBand).toBe('pit')
    expect(buildDashboardPresentation(state({ context: context('ferrari_296_gt3'), rpm: 7299 })).rpmBand).toBe('green')
    expect(buildDashboardPresentation(state({ context: context('ferrari_296_gt3'), rpm: 7300 })).rpmBand).toBe('blue')
  })

  it('applica un solo stato di urgenza carburante ai tre indicatori', () => {
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 1.1 })).fuelUrgency).toBe('normal')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 1 })).fuelUrgency).toBe('low')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.5 })).fuelUrgency).toBe('critical')
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: null })).fuelUrgency).toBe('normal')
  })

  it('fa pulsare il bordo carburante solo nello stato critico e quando abilitato', () => {
    const enabled = { ...DEFAULT_DASHBOARD_OPTIONS, fuelCriticalFlashEnabled: true }
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.6 }), enabled).fuelCriticalPulse).toBe(false)
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.5 }), enabled).fuelCriticalPulse).toBe(true)
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.4 })).fuelCriticalPulse).toBe(false)
    expect(buildDashboardPresentation(state({ fuelLapsRemaining: 0.4, isFresh: false }), enabled))
      .toMatchObject({ fuelUrgency: 'normal', fuelCriticalPulse: false })
  })

  it('normalizza la soglia carburante entro limiti sicuri', () => {
    expect(normalizeFuelCriticalLapsThreshold('bad')).toBe(0.5)
    expect(normalizeFuelCriticalLapsThreshold(0)).toBe(0.1)
    expect(normalizeFuelCriticalLapsThreshold(4)).toBe(1)
  })
})
