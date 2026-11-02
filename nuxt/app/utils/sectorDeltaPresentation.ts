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
  const invalid = lapValid === false
  if (sector.state !== 'complete' || sector.currentMs === null) {
    // Codex 02/11: on an invalid lap the sectors still to come are white too ("all three").
    return { deltaMs: null, color: invalid ? 'white' : sector.color }
  }
  const judge = (deltaMs: number): SectorHudColor => (invalid ? 'white' : deltaMs <= 0 ? 'purple' : 'red')

  // PIP-697: custom chosen but no time saved for this track and car: compare with the best
  // sector instead of a blank tile with no delta.
  if (reference === 'custom' && customReferenceMs !== null && Number.isFinite(customReferenceMs)) {
    const deltaMs = sector.currentMs - customReferenceMs
    return { deltaMs, color: judge(deltaMs) }
  }

  const bestReferenceMs = sector.bestReferenceMs
  if (bestReferenceMs == null || !Number.isFinite(bestReferenceMs)) {
    // Primo best: delta 0.000. Se il giro si invalida il delta resta, solo il colore diventa
    // bianco (non diventera' riferimento: lo decide il logger).
    return { deltaMs: 0, color: invalid ? 'white' : 'purple' }
  }

  const deltaMs = sector.currentMs - bestReferenceMs
  return { deltaMs, color: judge(deltaMs) }
}

export type SectorLapProblem = 'invalid_not_white' | 'color_vs_delta' | 'missing_delta' | 'first_not_purple'

/** One `hud.sector_state` line for a finished lap (PIP-704). */
export interface SectorLapTrace {
  lap: number
  lapValid: boolean
  firstBest: boolean
  ok: boolean
  problem: SectorLapProblem | null
  colors: SectorHudColor[]
  deltas: Array<number | null>
}

/**
 * The finished lap as the sectors HUD shows it, checked against the user's rules with the raw
 * numbers from the logger (current time and reference), independently of the presenter.
 * Null while no finished lap is shown.
 */
export function sectorLapTrace(
  hud: { mode?: string, lap?: number | null, lapValid?: boolean | null, sectors: SectorHudEntry[] } | null,
  reference: SectorDeltaReference,
  customTimes: Array<number | null> | null = null,
): SectorLapTrace | null {
  if (!hud || hud.mode !== 'last_lap' || typeof hud.lap !== 'number' || typeof hud.lapValid !== 'boolean') return null
  // Codex 02/11: a lap the logger could not rebuild (started mid-lap, lost splits) has no
  // sectors to judge; it is not a presentation error, so it is not traced at all.
  if (!hud.sectors.length || hud.sectors.some(sector => sector.state !== 'complete' || sector.currentMs === null)) return null
  const lapValid = hud.lapValid
  const shown = hud.sectors.map((sector) => resolveSectorDeltaPresentation(
    sector, reference, customTimes?.[sector.index - 1] ?? null, lapValid))
  const firstBest = hud.sectors.every(sector => sector.bestReferenceMs == null)
  let problem: SectorLapProblem | null = null
  hud.sectors.forEach((sector, offset) => {
    const presented = shown[offset]
    if (problem || !presented) return
    const { color, deltaMs } = presented
    if (sector.currentMs === null) return
    if (!lapValid) { if (color !== 'white') problem = 'invalid_not_white'; return }
    const custom = reference === 'custom' ? customTimes?.[sector.index - 1] ?? null : null
    const ref = custom !== null && Number.isFinite(custom) ? custom : sector.bestReferenceMs
    const expectedDelta = ref == null ? 0 : sector.currentMs - ref
    if (deltaMs === null) problem = 'missing_delta'
    else if (ref == null && (deltaMs !== 0 || color !== 'purple')) problem = 'first_not_purple'
    else if (deltaMs !== expectedDelta || color !== (expectedDelta <= 0 ? 'purple' : 'red')) problem = 'color_vs_delta'
  })
  return {
    lap: hud.lap, lapValid, firstBest, ok: problem === null, problem,
    colors: shown.map(item => item.color),
    deltas: shown.map(item => (item.deltaMs === null ? null : Math.round(item.deltaMs))),
  }
}
