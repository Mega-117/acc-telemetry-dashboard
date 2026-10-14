import type { SectorHudColor, SectorHudEntry } from '~/composables/useLiveStatePoller'

// PIP-524: the previous-lap comparison is gone; a saved 'previousLap' reads as best.
export type SectorDeltaReference = 'bestSector' | 'custom'

export interface SectorDeltaPresentation {
  deltaMs: number | null
  color: SectorHudColor
}

export function normalizeSectorDeltaReference(value: unknown): SectorDeltaReference {
  return value === 'custom' ? 'custom' : 'bestSector'
}

export function sectorDeltaReferenceToken(reference: SectorDeltaReference): 'BEST' | 'CUSTOM' {
  return reference === 'custom' ? 'CUSTOM' : 'BEST'
}

/**
 * Deriva soltanto delta e colore dal riferimento scelto. Tempi, best persistito
 * e visibilità delle righe restano responsabilità dei rispettivi layer.
 */
export function resolveSectorDeltaPresentation(
  sector: SectorHudEntry,
  reference: SectorDeltaReference,
  customReferenceMs: number | null = null,
): SectorDeltaPresentation {
  if (sector.state !== 'complete' || sector.currentMs === null) {
    return { deltaMs: null, color: sector.color }
  }
  // Pit-lane sectors and invalid laps arrive neutral from the logger: they
  // keep their time and delta but never a judgement colour (PIP-524).
  const neutral = sector.color === 'grey'

  if (reference === 'custom') {
    if (customReferenceMs === null || !Number.isFinite(customReferenceMs)) return { deltaMs: null, color: 'white' }
    const deltaMs = sector.currentMs - customReferenceMs
    return { deltaMs, color: neutral ? 'grey' : deltaMs <= 0 ? 'green' : 'red' }
  }

  const bestReferenceMs = sector.bestReferenceMs
  if (bestReferenceMs == null || !Number.isFinite(bestReferenceMs)) {
    return { deltaMs: null, color: 'white' }
  }

  const deltaMs = sector.currentMs - bestReferenceMs
  if (neutral) return { deltaMs, color: 'grey' }
  if (sector.currentMs < bestReferenceMs) {
    return { deltaMs, color: 'purple' }
  }
  return { deltaMs, color: deltaMs <= 0 ? 'green' : 'red' }
}
