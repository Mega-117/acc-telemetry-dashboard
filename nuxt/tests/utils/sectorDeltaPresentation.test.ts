import { describe, expect, it } from 'vitest'
import type { SectorHudEntry } from '~/composables/useLiveStatePoller'
import {
  normalizeSectorDeltaReference,
  resolveCurrentLapValidity,
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
  it('normalizza sul giro precedente per compatibilità con impostazioni mancanti o invalide', () => {
    expect(normalizeSectorDeltaReference(undefined)).toBe('previousLap')
    expect(normalizeSectorDeltaReference('other')).toBe('previousLap')
    expect(normalizeSectorDeltaReference('bestSector')).toBe('bestSector')
  })

  it('espone un solo token BEST/LAST consumato da entrambi i layout', () => {
    expect(sectorDeltaReferenceToken('previousLap')).toBe('LAST')
    expect(sectorDeltaReferenceToken('bestSector')).toBe('BEST')
  })

  it('mantiene il latch invalido quando il campione fast torna valido', () => {
    expect(resolveCurrentLapValidity(true, false)).toBe(false)
    expect(resolveCurrentLapValidity(true, null)).toBeNull()
    expect(resolveCurrentLapValidity(false, true)).toBe(true)
  })

  it('preserva delta e colore esistenti con Giro precedente', () => {
    expect(resolveSectorDeltaPresentation(sector(), 'previousLap')).toEqual({
      deltaMs: -200,
      color: 'green',
    })
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
