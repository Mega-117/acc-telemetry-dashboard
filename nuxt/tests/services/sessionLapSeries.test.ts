import { describe, expect, it } from 'vitest'
import {
  buildIncludedLapSummary,
  buildLapExclusionKey,
  buildLapTooltipLines,
  buildLapTooltipTitle,
  filterIncludedLapPoints,
  normalizeLapSeries,
  normalizeStrategyLapSeries
} from '~/services/session-detail/sessionLapSeries'

describe('sessionLapSeries', () => {
  it('crea chiavi esclusione distinte per giri uguali in stint diversi', () => {
    expect(buildLapExclusionKey({ source: 'a', stintNumber: 1, lapNumber: 1 }))
      .toBe('a:1:1')
    expect(buildLapExclusionKey({ source: 'a', stintNumber: 2, lapNumber: 1 }))
      .toBe('a:2:1')
    expect(buildLapExclusionKey({ source: 'b', stintNumber: 1, lapNumber: 1 }))
      .toBe('b:1:1')
  })

  it('normalizza una serie stint singola con display index continuo', () => {
    const points = normalizeLapSeries({
      laps: [
        { lap: 7, time: '1:41.000', valid: true, pit: false, fuel: 80, airTemp: 22, grip: 'Optimum' },
        { lap: 8, time: '1:42.500', valid: false, pit: false, fuel: 78, airTemp: 23, grip: 'Fast' }
      ],
      source: 'a',
      strategy: 'A',
      stintNumber: 3
    })

    expect(points.map((point) => point.exclusionKey)).toEqual(['a:3:7', 'a:3:8'])
    expect(points.map((point) => point.displayIndex)).toEqual([1, 2])
    expect(points[0]).toMatchObject({
      stintNumber: 3,
      stintLapNumber: 7,
      sessionLapNumber: 7,
      timeSeconds: 101,
      valid: true,
      pit: false
    })
  })

  it('usa number come numero giro canonico per dati cross-session normalizzati', () => {
    const points = normalizeLapSeries({
      laps: [
        { number: 5, time: '1:37.395', valid: true },
        { number: 6, time: '1:37.480', valid: true }
      ],
      source: 'b',
      strategy: 'B',
      stintNumber: 2
    })

    expect(points.map((point) => point.stintLapNumber)).toEqual([5, 6])
    expect(points.map((point) => point.exclusionKey)).toEqual(['b:2:5', 'b:2:6'])
  })

  it('concatena strategie multi-stint senza perdere il numero giro reale', () => {
    const lapsByStint: Record<number, any[]> = {
      1: [
        { lap: 1, time: '1:41.000', valid: true },
        { lap: 2, time: '1:42.000', valid: true }
      ],
      2: [
        { lap: 1, sessionLapNumber: 3, time: '1:43.000', valid: true },
        { lap: 2, sessionLapNumber: 4, time: '1:44.000', valid: true }
      ]
    }

    const points = normalizeStrategyLapSeries({
      stints: [{ number: 1 }, { number: 2 }],
      getLaps: (stintNumber) => lapsByStint[stintNumber] || [],
      source: 'a',
      strategy: 'A'
    })

    expect(points.map((point) => point.displayIndex)).toEqual([1, 2, 3, 4])
    expect(points.map((point) => point.exclusionKey)).toEqual(['a:1:1', 'a:1:2', 'a:2:1', 'a:2:2'])
    expect(points.map((point) => point.sessionLapNumber)).toEqual([1, 2, 3, 4])
    expect(points.filter((point) => point.isStintStart).map((point) => point.stintNumber)).toEqual([1, 2])
  })

  it('filtra i punti inclusi usando exclusionKey, non solo numero giro', () => {
    const points = normalizeStrategyLapSeries({
      stints: [{ number: 1 }, { number: 2 }],
      getLaps: (stintNumber) => [{ lap: 1, time: '1:41.000', valid: true, stintNumber }],
      source: 'a',
      strategy: 'A'
    })

    const included = filterIncludedLapPoints(points, new Set(['a:1:1']))

    expect(included).toHaveLength(1)
    expect(included[0]?.exclusionKey).toBe('a:2:1')
  })

  it('calcola il riepilogo solo dai giri inclusi validi non pit', () => {
    const points = normalizeLapSeries({
      laps: [
        { lap: 1, time: '1:40.000', valid: true },
        { lap: 2, time: '1:39.000', valid: true },
        { lap: 3, time: '1:38.000', valid: true },
        { lap: 4, time: '1:37.000', valid: true },
        { lap: 5, time: '1:36.000', valid: true },
        { lap: 6, time: '1:35.000', valid: false },
        { lap: 7, time: '1:34.000', valid: true, pit: true }
      ],
      source: 'a',
      strategy: 'A',
      stintNumber: 1
    })

    expect(buildIncludedLapSummary(points)).toMatchObject({
      laps: 7,
      validLapsCount: 5,
      bestMs: 96000,
      avgMs: 98000,
      avgWarning: false,
      durationMs: 679000
    })
  })

  it('ricalcola best, media e durata quando un giro viene escluso', () => {
    const points = normalizeLapSeries({
      laps: [
        { lap: 1, time: '1:40.000', valid: true },
        { lap: 2, time: '1:39.000', valid: true },
        { lap: 3, time: '1:38.000', valid: true },
        { lap: 4, time: '1:37.000', valid: true },
        { lap: 5, time: '1:36.000', valid: true }
      ],
      source: 'b',
      strategy: 'B',
      stintNumber: 2
    })

    const included = filterIncludedLapPoints(points, new Set([
      buildLapExclusionKey({ source: 'b', stintNumber: 2, lapNumber: 5 })
    ]))
    const summary = buildIncludedLapSummary(included)

    expect(summary.bestMs).toBe(97000)
    expect(summary.avgMs).toBeNull()
    expect(summary.avgWarning).toBe(true)
    expect(summary.validLapsCount).toBe(4)
    expect(summary.durationMs).toBe(394000)
  })

  it('costruisce tooltip espliciti per strategia, stint, giro e stato', () => {
    const [point] = normalizeLapSeries({
      laps: [{ lapNumber: 12, lapTime: '1:45.250', valid: false, pit: false, fuel: 55, air: 24, grip: 'Green' }],
      source: 'b',
      strategy: 'B',
      stintNumber: 4
    })

    expect(buildLapTooltipTitle(point)).toBe('Strategia B · Stint #4 · Giro 12')
    expect(buildLapTooltipLines(point)).toEqual([
      'Giro stint: 12',
      'Tempo: 1:45.250',
      'Stato: INV',
      'Fuel: 55L',
      'Air: 24°C',
      'Grip: Green'
    ])
  })
})
