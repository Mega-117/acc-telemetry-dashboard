// PIP-633: presentazione delle Statistiche.
import { describe, expect, it } from 'vitest'
import {
  airInsight, byIdealMargin, carInsight, compareInsight, gapBarPct, heatLevel, idealInsight, marginLevel, rowBest,
} from '~/utils/statsPresentation'
import type { ComboStats } from '~/services/telemetry/activityStats'

const combo = (track: string, sectors: (number | null)[], best: number | null): ComboStats => ({
  track, car: 'ferrari', sessions: 1, lastDate: '2026-10-25', bestLapMs: best,
  bestSectorsMs: sectors as ComboStats['bestSectorsMs'], byAir: {}, byGrip: {},
})

describe('statsPresentation', () => {
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
    ], name)).toBe('Auto più usata: FERRARI, 75% del tempo in pista.')
    expect(carInsight([{ carKey: 'a', car: 'audi', timeMs: 5, sessions: 1, laps: 1, lapsValid: 1 }], name)).toBe('Una sola auto nel periodo: AUDI.')
    expect(carInsight([
      { carKey: 'f', car: 'ferrari', timeMs: 2_000, sessions: 1, laps: 1, lapsValid: 1 },
      { carKey: 'm', car: 'merc', timeMs: 2_000, sessions: 1, laps: 1, lapsValid: 1 },
    ], name)).toBe('Tempo diviso in parti uguali tra FERRARI e MERC.')
    expect(carInsight([], name)).toBeNull()

    const row = (track: string, gapMs: number | null, timeA = 1, timeB = 1) => ({ track, gapMs, timeA, timeB })
    expect(compareInsight([row('spa', -918), row('monza', 300), row('imola', null, 1, 0)], 'Ferrari', 'Mercedes', name))
      .toBe('Mercedes più veloce su 1 pista su 2. Differenza più grande: SPA, 0,9 s a favore di Mercedes.')
    expect(compareInsight([row('spa', 400)], 'Ferrari', 'Mercedes', name)).toBe('Unica pista in comune, SPA: più veloce Ferrari, di 0,4 s.')
    expect(compareInsight([row('spa', 0)], 'Ferrari', 'Mercedes', name)).toBe('Unica pista in comune, SPA: tempi praticamente uguali.')
    expect(compareInsight([row('spa', 20), row('monza', -10)], 'A', 'B', name)).toContain('praticamente uguali')
    expect(compareInsight([row('spa', null)], 'A', 'B', name)).toContain('senza un miglior giro valido')
    expect(compareInsight([row('spa', null, 1, 0)], 'A', 'B', name)).toContain('Nessuna pista')

    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: -1293 }], name, name)).toBe('Dove puoi guadagnare di più: MONZA con FERRARI, 1,3 s mettendo insieme i tuoi settori migliori.')
    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: -50 }], name, name)).toContain('già vicini')
    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: 5000 }], name, name)).toBeNull()
    expect(idealInsight([{ track: 'monza', car: 'ferrari', marginMs: null }], name, name)).toBeNull()
    const bands = [{ id: 'lt15', label: '< 15°' }, { id: '15-20', label: '15–20°' }, { id: '20-25', label: '20–25°' }]
    expect(airInsight([{ byAir: { '15-20': 100, '20-25': 101 } }, { byAir: { '15-20': 90, lt15: 95 } }, { byAir: { lt15: 80 } }], bands))
      .toBe('Vai più forte con aria tra 15 e 20°: è la tua condizione migliore su 2 combinazioni pista-auto.')
    expect(airInsight([{ byAir: { lt15: 80, '20-25': 90 } }], bands)).toBe('Vai più forte con aria sotto i 15°: è la tua condizione migliore su 1 combinazione pista-auto.')
    expect(airInsight([{ byAir: { lt15: 80 } }], bands)).toBeNull()
    expect(airInsight([{ byAir: { lt15: 80, '20-25': 80 } }], bands)).toBeNull()
    expect(airInsight([{ byAir: { lt15: 80, '20-25': 90 } }, { byAir: { lt15: 95, '20-25': 90 } }], bands)).toContain('distribuiti')
  })

  it('scales gap bars on the largest gap, with a visible minimum', () => {
    expect(gapBarPct(-918, 918)).toBe(100)
    expect(gapBarPct(10, 918)).toBe(4)
    expect(gapBarPct(null, 918)).toBe(0)
    expect(gapBarPct(0, 918)).toBe(0)
    expect(gapBarPct(100, 0)).toBe(0)
  })
})
