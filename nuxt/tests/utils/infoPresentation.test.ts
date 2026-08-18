import { describe, expect, it } from 'vitest'
import {
  buildInfoPresentation,
  DEFAULT_INFO_OPTIONS,
  evaluateInfoTarget,
  formatInfoDelta,
  formatInfoDuration,
  formatInfoFuelDuration,
  formatInfoLapTime,
  formatInfoLocalTime,
  formatInfoRunningLapTime,
  formatInfoStintDuration,
} from '~/utils/infoPresentation'

const state = {
  flag: 2,
  info: {
    delta: { ms: -245, available: true, side: 'negative', ratio: 0.5, purple: false },
    stintTimeLeftMs: 180_000,
    fuelLabel: 'Q-Fuel',
    fuelNeededL: 0,
    fuelLeftTimeMs: 360_000,
    fuelLeftReferenceLapMs: 90_000,
    incidents: 2,
    grip: 'Green',
    pitExitTraffic: null,
    optimalLapTimeMs: 89_123,
    bestLapTimeMs: 90_456,
    damageTimeMs: 12_345,
    currentLapTimeMs: 45_678,
    lastLapTimeMs: 90_000,
    lapValid: true,
    lastLapValid: true,
    lapsCompleted: 3,
  },
} as any

describe('Info presentation', () => {
  it('formatta delta e tempi come il riferimento', () => {
    expect(formatInfoDelta(-245)).toBe('-0.245')
    expect(formatInfoDelta(0)).toBe('+0.000')
    expect(formatInfoLapTime(89_123)).toBe('1:29.123')
    expect(formatInfoLapTime(null)).toBe('--:--.---')
    expect(formatInfoRunningLapTime(0)).toBe('0:00.000')
    expect(formatInfoRunningLapTime(null)).toBe('--:--.---')
    expect(formatInfoDuration(298_999)).toBe('4:58.000')
    expect(formatInfoDuration(3_661_000)).toBe('1:01:01')
    expect(formatInfoDuration(null)).toBe('--:--.---')
    expect(formatInfoFuelDuration(298_999)).toBe('0:04:58')
    expect(formatInfoFuelDuration(null)).toBe('-:--.---')
    expect(formatInfoStintDuration(0)).toBe('00:00')
    expect(formatInfoStintDuration(413_000)).toBe('06:53')
    expect(formatInfoStintDuration(null)).toBe('--:--.---')
    const localTime = new Date(2026, 6, 26, 15, 48, 56).getTime()
    expect(formatInfoLocalTime(localTime)).toBe('15:48:56')
  })

  it('mantiene ordine e fallback dei campi Info', () => {
    const model = buildInfoPresentation(state, {
      ...DEFAULT_INFO_OPTIONS,
      showQFuel: true,
      showFuelLeft: true,
      showIncidents: true,
      showOptimal: true,
    })
    expect(model.yellowFlagActive).toBe(true)
    expect(model.delta).toMatchObject({ value: '-0.245', side: 'negative', ratio: 0.5 })
    expect(model.rows.map(row => row.id)).toEqual([
      'stint', 'q-fuel', 'fuel-left', 'incidents', 'grip',
      'optimal', 'best', 'damage', 'lap-timer',
    ])
    expect(model.rows.find(row => row.id === 'fuel-left')?.value).toBe('0:06:00')
    expect(model.rows.find(row => row.id === 'lap-timer')?.lapTimer).toBe(true)
  })

  it('mostra Pit Exit soltanto in gara', () => {
    const model = buildInfoPresentation({ ...state, sessionType: 2 } as any, {
      ...DEFAULT_INFO_OPTIONS,
      showPitExitTraffic: true,
    })
    expect(model.rows.find(row => row.id === 'pit-exit')?.value).toBe('--')
  })

  it('classifica il traffico Pit Exit già attribuito dal provider', () => {
    const options = { ...DEFAULT_INFO_OPTIONS, showPitExitTraffic: true }
    const row = (value: number | null) => buildInfoPresentation({
      ...state,
      sessionType: 2,
      info: { ...state.info, pitExitTraffic: value },
    } as any, options).rows.find(item => item.id === 'pit-exit')

    expect(row(0)).toMatchObject({ value: 'Clear', tone: 'default' })
    expect(row(2)).toMatchObject({ value: 'Low', tone: 'yellow' })
    expect(row(4)).toMatchObject({ value: 'Busy', tone: 'orange' })
    expect(row(5)).toMatchObject({ value: 'Crowded', tone: 'red' })
  })

  it('mantiene il Delta neutro e la barra visibili quando il valore e zero', () => {
    const model = buildInfoPresentation({
      ...state,
      info: {
        ...state.info,
        delta: { ms: 0, available: false, side: 'zero', ratio: 0, purple: false },
      },
    } as any, DEFAULT_INFO_OPTIONS)

    expect(model.delta).toEqual({
      visible: true,
      value: '+0.000',
      side: 'zero',
      ratio: 0,
      purple: false,
    })
    expect(buildInfoPresentation(state, {
      ...DEFAULT_INFO_OPTIONS,
      showDelta: false,
    }).delta.visible).toBe(false)
  })

  it('applica le soglie ACC Drive per il colore Fuel Left', () => {
    const row = (valueMs: number | null, referenceLapMs: number | null) => buildInfoPresentation({
      ...state,
      info: {
        ...state.info,
        fuelLeftTimeMs: valueMs,
        fuelLeftReferenceLapMs: referenceLapMs,
      },
    } as any, {
      ...DEFAULT_INFO_OPTIONS,
      showFuelLeft: true,
    }).rows.find(item => item.id === 'fuel-left')

    expect(row(300_000, 90_000)).toMatchObject({ tone: 'default' })
    expect(row(240_000, 90_000)).toMatchObject({ tone: 'yellow' })
    expect(row(90_000, 90_000)).toMatchObject({ tone: 'orange' })
    expect(row(0, 90_000)).toMatchObject({ value: '-:--.---', tone: 'orange' })
  })

  it('separa Local Time originale dal Lap Timer Target', () => {
    const model = buildInfoPresentation(state, { ...DEFAULT_INFO_OPTIONS, showTime: true })
    expect(model.rows.slice(-2).map(row => row.id)).toEqual(['local-time', 'lap-timer'])
    expect(model.rows.find(row => row.id === 'local-time')).toMatchObject({
      label: 'Time:',
      value: '--:--:--',
      localTime: true,
    })
  })

  it('applica la soglia massima di ritardo del Target', () => {
    const target = { active: true, targetTimeMs: 90_000, toleranceMs: 500, keepBetweenSessions: false }
    expect(evaluateInfoTarget(88_000, true, target)).toBe('inside')
    expect(evaluateInfoTarget(90_500, true, target)).toBe('inside')
    expect(evaluateInfoTarget(90_501, true, target)).toBe('outside')
    expect(evaluateInfoTarget(90_501, false, target)).toBe('neutral')
  })
})
