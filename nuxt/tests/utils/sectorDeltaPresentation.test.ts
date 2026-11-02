import { describe, expect, it } from 'vitest'
import type { SectorHudEntry } from '~/composables/useLiveStatePoller'
import {
  normalizeSectorDeltaReference,
  resolveSectorDeltaPresentation,
  sectorDeltaReferenceToken,
} from '~/utils/sectorDeltaPresentation'

function sector(overrides: Partial<SectorHudEntry> = {}): SectorHudEntry {
  return {
    index: 1,
    state: 'complete',
    currentMs: 30_800,
    referenceMs: 31_000,
    bestMs: 30_500,
    bestReferenceMs: 30_500,
    deltaMs: -200,
    color: 'green',
    ...overrides,
  }
}

describe('sectorDeltaPresentation', () => {
  it('PIP-524: reads a saved previous-lap or missing reference as best sector', () => {
    expect(normalizeSectorDeltaReference(undefined)).toBe('bestSector')
    expect(normalizeSectorDeltaReference('previousLap')).toBe('bestSector')
    expect(normalizeSectorDeltaReference('other')).toBe('bestSector')
    expect(normalizeSectorDeltaReference('custom')).toBe('custom')
  })

  it('espone un solo token BEST/CUSTOM consumato da entrambi i layout', () => {
    expect(sectorDeltaReferenceToken('bestSector')).toBe('BEST')
    expect(sectorDeltaReferenceToken('custom')).toBe('CUSTOM')
  })

  it('PIP-704: giro non valido = tutti i settori bianchi, il delta resta visibile', () => {
    for (const currentMs of [30_300, 30_500, 30_800]) {
      expect(resolveSectorDeltaPresentation(sector({ currentMs }), 'bestSector', null, false))
        .toEqual({ deltaMs: currentMs - 30_500, color: 'white' })
    }
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_300 }), 'custom', 31_000, false))
      .toEqual({ deltaMs: -700, color: 'white' })
  })

  it('PIP-704: la pit lane non ha un colore suo, conta solo la validità del giro', () => {
    // An old logger still sends grey for pit sectors: the colour is decided here.
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_300, color: 'grey', pit: true }), 'bestSector', null, true))
      .toEqual({ deltaMs: -200, color: 'purple' })
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_800, color: 'grey', pit: true }), 'bestSector', null, null))
      .toEqual({ deltaMs: 300, color: 'red' })
  })

  it('PIP-704: viola sotto o pari al best, rosso sopra; mai verde', () => {
    expect(resolveSectorDeltaPresentation(sector(), 'bestSector')).toEqual({ deltaMs: 300, color: 'red' })
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_500 }), 'bestSector')).toEqual({ deltaMs: 0, color: 'purple' })
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_300 }), 'bestSector')).toEqual({ deltaMs: -200, color: 'purple' })
  })

  it('PIP-704: primo giro lanciato (nessun best) = 0.000 viola; non valido = bianco senza delta', () => {
    const first = sector({ bestReferenceMs: null, referenceMs: 31_000, deltaMs: null })
    expect(resolveSectorDeltaPresentation(first, 'bestSector', null, true)).toEqual({ deltaMs: 0, color: 'purple' })
    expect(resolveSectorDeltaPresentation(first, 'bestSector')).toEqual({ deltaMs: 0, color: 'purple' })
    expect(resolveSectorDeltaPresentation(first, 'bestSector', null, false)).toEqual({ deltaMs: null, color: 'white' })
  })

  it('non calcola il delta finché il settore non è completo', () => {
    expect(resolveSectorDeltaPresentation(sector({
      state: 'running',
      currentMs: null,
      deltaMs: null,
      color: 'white',
    }), 'bestSector')).toEqual({
      deltaMs: null,
      color: 'white',
    })
  })
})
