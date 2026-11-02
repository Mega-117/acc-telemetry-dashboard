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
 *
 * Regole utente del 02/11 (PIP-704), uguali per Compatto e Classico:
 * - viola = sotto o pari al riferimento; rosso = sopra;
 * - nessun best ancora (primo giro lanciato) = il settore diventa il best: 0.000 viola;
 * - giro non valido = tutti i settori bianchi, il delta resta visibile;
 * - la pit lane non ha un colore suo: conta solo la validita' del giro.
 * `lapValid` e' la validita' del giro mostrato (in corso o trattenuto a fine giro).
 */
export function resolveSectorDeltaPresentation(
  sector: SectorHudEntry,
  reference: SectorDeltaReference,
  customReferenceMs: number | null = null,
  lapValid: boolean | null = null,
): SectorDeltaPresentation {
  if (sector.state !== 'complete' || sector.currentMs === null) {
    return { deltaMs: null, color: sector.color }
  }
  const invalid = lapValid === false
  const judge = (deltaMs: number): SectorHudColor => (invalid ? 'white' : deltaMs <= 0 ? 'purple' : 'red')

  // PIP-697: custom chosen but no time saved for this track and car: compare with the best
  // sector instead of a blank tile with no delta.
  if (reference === 'custom' && customReferenceMs !== null && Number.isFinite(customReferenceMs)) {
    const deltaMs = sector.currentMs - customReferenceMs
    return { deltaMs, color: judge(deltaMs) }
  }

  const bestReferenceMs = sector.bestReferenceMs
  if (bestReferenceMs == null || !Number.isFinite(bestReferenceMs)) {
    // Primo best: delta 0.000. Su un giro non valido non diventa riferimento: niente delta.
    return invalid ? { deltaMs: null, color: 'white' } : { deltaMs: 0, color: 'purple' }
  }

  const deltaMs = sector.currentMs - bestReferenceMs
  return { deltaMs, color: judge(deltaMs) }
}
