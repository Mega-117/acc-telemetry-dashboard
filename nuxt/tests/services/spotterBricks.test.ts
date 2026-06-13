import { describe, expect, it } from 'vitest'
import {
  collectSpotterBricks,
  deltaBrickId,
  sectorBrickId,
  spotterBrickPath,
  spotterEventToBricks,
  tokenizeSpotterTemplate,
} from '~/services/spotter/spotterBricks'
import { formatSpotterDelta, formatSpotterSector } from '~/services/spotter/spotterFormatters'

describe('spotterBricks', () => {
  it('tokenizza un template in parti letterali e slot in ordine', () => {
    const tokens = tokenizeSpotterTemplate('Davanti, guadagni {delta}. Punto buono: settore {sector}.')
    expect(tokens).toEqual([
      { kind: 'lit', index: 0, text: 'Davanti, guadagni' },
      { kind: 'slot', slot: 'delta' },
      { kind: 'lit', index: 2, text: 'Punto buono: settore' },
      { kind: 'slot', slot: 'sector' },
    ])
  })

  it('mappa delta sul mattoncino col parlato identico a formatSpotterDelta', () => {
    const bricks = collectSpotterBricks()
    for (const ms of [80, 120, 250, 950, 1000, 1300, 1580, 2400]) {
      const id = deltaBrickId(ms)
      expect(bricks[id]).toBe(formatSpotterDelta(ms))
    }
  })

  it('mappa settore sul mattoncino col parlato identico a formatSpotterSector', () => {
    const bricks = collectSpotterBricks()
    for (const sector of [1, 2, 3, null] as const) {
      const id = sectorBrickId(sector)
      expect(bricks[id]).toBe(formatSpotterSector(sector))
    }
  })

  it('costruisce la sequenza di mattoncini di un evento sulla variante fissata', () => {
    const ids = spotterEventToBricks({ messageKey: 'aheadGaining', messageVariant: 0, deltaMs: 250, sector: 2 })
    expect(ids).toEqual(['lit-aheadGaining-0-0', 'delta-t2', 'lit-aheadGaining-0-2', 'sector-2'])
  })

  it('rispetta la variante richiesta e la clampa nei limiti', () => {
    const v1 = spotterEventToBricks({ messageKey: 'aheadGaining', messageVariant: 1, sector: 3 })
    expect(v1).toEqual(['lit-aheadGaining-1-0', 'sector-3'])
    const clamped = spotterEventToBricks({ messageKey: 'aheadStable', messageVariant: 9 })
    expect(clamped).toEqual(['lit-aheadStable-0-0'])
  })

  it('tutti gli id usati dalle sequenze esistono nel manifest', () => {
    const bricks = collectSpotterBricks()
    const sample = [
      ...spotterEventToBricks({ messageKey: 'aheadGaining', messageVariant: 0, deltaMs: 250, sector: 2 }),
      ...spotterEventToBricks({ messageKey: 'behindClosing', messageVariant: 0, deltaMs: 1300, sector: 1 }),
      ...spotterEventToBricks({ messageKey: 'attackWindow', messageVariant: 0, sector: 3 }),
    ]
    for (const id of sample) expect(bricks[id], `manca il mattoncino ${id}`).toBeDefined()
  })

  it('compone il path del WAV per voce', () => {
    expect(spotterBrickPath('delta-t2', 'if_sara')).toBe('/voice/spotter/sp-delta-t2-if_sara.wav')
  })
})
