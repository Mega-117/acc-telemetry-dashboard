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

  it('PIP-524: pit-lane and invalid sectors stay neutral against best and custom', () => {
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_300, color: 'grey' }), 'bestSector'))
      .toEqual({ deltaMs: -200, color: 'grey' })
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_300, color: 'grey' }), 'custom', 31_000))
      .toEqual({ deltaMs: -700, color: 'grey' })
  })

  it('calcola delta contro il best esistente e mantiene la semantica colori', () => {
    expect(resolveSectorDeltaPresentation(sector(), 'bestSector')).toEqual({
      deltaMs: 300,
      color: 'red',
    })
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_500 }), 'bestSector')).toEqual({
      deltaMs: 0,
      color: 'green',
    })
    expect(resolveSectorDeltaPresentation(sector({ currentMs: 30_300 }), 'bestSector')).toEqual({
      deltaMs: -200,
      color: 'purple',
    })
  })

  it('resta Wait senza fallback quando manca il best selezionato', () => {
    expect(resolveSectorDeltaPresentation(sector({
      bestReferenceMs: null,
      referenceMs: 31_000,
      deltaMs: -200,
    }), 'bestSector')).toEqual({
      deltaMs: null,
      color: 'white',
    })
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
