import type { SectorHudColor, SectorHudEntry } from '~/composables/useLiveStatePoller'

export type SectorDeltaReference = 'previousLap' | 'bestSector' | 'custom'

export interface SectorDeltaPresentation {
  deltaMs: number | null
  color: SectorHudColor
}

export function normalizeSectorDeltaReference(value: unknown): SectorDeltaReference {
  return value === 'custom' ? 'custom' : value === 'bestSector' ? 'bestSector' : 'previousLap'
}

export function sectorDeltaReferenceToken(reference: SectorDeltaReference): 'BEST' | 'LAST' | 'CUSTOM' {
  return reference === 'custom' ? 'CUSTOM' : reference === 'bestSector' ? 'BEST' : 'LAST'
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
  // Il default conserva senza reinterpretazioni il contratto storico del logger.
  if (reference === 'previousLap') {
    return { deltaMs: sector.deltaMs, color: sector.color }
  }

  if (sector.state !== 'complete' || sector.currentMs === null) {
    return { deltaMs: null, color: sector.color }
  }

  if (reference === 'custom') {
    if (customReferenceMs === null || !Number.isFinite(customReferenceMs)) return { deltaMs: null, color: 'white' }
    const deltaMs = sector.currentMs - customReferenceMs
    return { deltaMs, color: deltaMs <= 0 ? 'green' : 'red' }
  }

  const bestReferenceMs = sector.bestReferenceMs
  if (bestReferenceMs === null) {
    return { deltaMs: null, color: 'white' }
  }

  const deltaMs = sector.currentMs - bestReferenceMs
  if (sector.currentMs < bestReferenceMs) {
    return { deltaMs, color: 'purple' }
  }
  return { deltaMs, color: deltaMs <= 0 ? 'green' : 'red' }
}
