// PIP-633: presentazione delle Statistiche.
import { describe, expect, it } from 'vitest'
import {
  airInsight, byIdealMargin, carInsight, compareInsight, gapBarPct, heatLevel, idealInsight, marginLevel, rowBest, statsTotals,
} from '~/utils/statsPresentation'
import type { ComboStats } from '~/services/telemetry/activityStats'

const combo = (track: string, sectors: (number | null)[], best: number | null): ComboStats => ({
  track, car: 'ferrari', sessions: 1, lastDate: '2026-10-25', bestLapMs: best,
  bestSectorsMs: sectors as ComboStats['bestSectorsMs'], byAir: {}, byGrip: {},
})

describe('statsPresentation', () => {
  it('sums the period and computes valid laps percentage', () => {
    expect(statsTotals([
      { carKey: 'a', car: 'A', timeMs: 3_600_000, sessions: 2, laps: 30, lapsValid: 24 },
      { carKey: 'b', car: 'B', timeMs: 600_000, sessions: 1, laps: 10, lapsValid: 6 },
    ])).toEqual({ timeMs: 4_200_000, sessions: 3, laps: 40, lapsValid: 30, validPct: 75 })
    expect(statsTotals([]).validPct).toBeNull()
  })

  it('orders combos by margin to gain, combos without data last', () => {
    const rows = byIdealMargin([
      combo('small', [30_000, 30_000, 30_000], 90_100),
      combo('none', [30_000, null, 30_000], 90_000),
      combo('big', [30_000, 30_000, 30_000], 91_300),
    ])
    expect(rows.map(r => [r.track, r.marginMs])).toEqual([['big', -1300], ['small', -100], ['none', null]])
    expect(rows[0]!.idealMs).toBe(90_000)
  })

  it('colors margin and distance from the row best', () => {
    expect([marginLevel(-1300), marginLevel(-250), marginLevel(-50), marginLevel(null)]).toEqual(['big', 'mid', 'small', null])
    expect([heatLevel(100_000, 100_000), heatLevel(100_200, 100_000), heatLevel(100_900, 100_000), heatLevel(101_800, 100_000), heatLevel(103_000, 100_000)])
      .toEqual([0, 1, 2, 3, 4])
    expect([heatLevel(undefined, 100_000), heatLevel(100_000, null)]).toEqual([null, null])
    expect(rowBest([undefined, 101_000, 0, 100_500])).toBe(100_500)
    expect(rowBest([undefined])).toBeNull()
  })

  it('explains each panel in plain words', () => {
    const name = (s: string) => s.toUpperCase()
    expect(carInsight([
      { carKey: 'f', car: 'ferrari', timeMs: 3_000, sessions: 1, laps: 1, lapsValid: 1 },
      { carKey: 'm', car: 'merc', timeMs: 1_000, sessions: 1, laps: 1, lapsValid: 1 },
    ], name)).toBe('Usi soprattutto la FERRARI: 75% del tempo in pista.')
    expect(carInsight([], name)).toBeNull()
    expect(compareInsight([{ track: 'spa', gapMs: -918 }, { track: 'monza', gapMs: 300 }, { track: 'imola', gapMs: null }], 'Ferrari', 'Mercedes', name))
      .toBe('Su 2 piste in comune la Mercedes è più veloce in 1. Differenza più grande: SPA, 0,9 s a favore della Mercedes.')
    expect(compareInsight([{ track: 'spa', gapMs: 400 }], 'Ferrari', 'Mercedes', name)).toBe('Sull\'unica pista in comune, SPA, la Ferrari è più veloce di 0,4 s.')
    expect(compareInsight([{ track: 'spa', gapMs: null }], 'A', 'B', name)).toContain('Nessuna pista')
    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: -1293 }], name, name)).toBe('Dove puoi guadagnare di più: MONZA con la FERRARI, 1,3 s mettendo insieme i tuoi settori migliori.')
    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: -50 }], name, name)).toContain('già vicini')
    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: null }], name, name)).toBeNull()
    const bands = [{ id: 'lt15', label: '< 15°' }, { id: '15-20', label: '15–20°' }, { id: '20-25', label: '20–25°' }]
    expect(airInsight([{ byAir: { '15-20': 100, '20-25': 101 } }, { byAir: { '15-20': 90, lt15: 95 } }, { byAir: { lt15: 80 } }], bands))
      .toBe('Vai più forte con aria tra 15 e 20°: è la tua condizione migliore su 2 combinazioni pista-auto.')
    expect(airInsight([{ byAir: { lt15: 80, '20-25': 90 } }], bands)).toBe('Vai più forte con aria sotto i 15°: è la tua condizione migliore su 1 combinazione pista-auto.')
    expect(airInsight([{ byAir: { lt15: 80 } }], bands)).toBeNull()
  })

  it('scales gap bars on the largest gap, with a visible minimum', () => {
    expect(gapBarPct(-918, 918)).toBe(100)
    expect(gapBarPct(10, 918)).toBe(4)
    expect(gapBarPct(null, 918)).toBe(0)
    expect(gapBarPct(100, 0)).toBe(0)
  })
})
