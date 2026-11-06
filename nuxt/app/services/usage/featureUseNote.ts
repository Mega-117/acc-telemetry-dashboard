// PIP-632: una riga nel diario diagnostico quando si usa una funzione nuova, per sapere cosa
// usano davvero i tester e verificare la checklist dai pacchetti R2. Solo nome e conteggi:
// il programma accetta una lista chiusa di eventi e scarta tutto il resto. Nel browser non fa nulla.
export type FeatureUseNote =
  | { event: 'stats.opened', sessions: number }
  | { event: 'telemetry.opened', laps: number }
  | { event: 'laps.share_pasted', laps: number }
  /** PIP-650: other drivers' laps loaded as references, and those discarded as not believable. */
  | { event: 'laps.library_loaded', laps: number, rejected: number }
  /** dev.10 spies (the program's list says what each number means). */
  | { event: 'laps.reference_pick', origin: number, relaxed: number, kindWrong: number }
  | { event: 'laps.coach_loaded', laps: number, otherCar: number, failed: number }
  | { event: 'laps.ideal_built', segments: number, joinsSkipped: number, gainTenthsPct: number }
  | { event: 'laps.stint_card', kind: number, reference: number, bestMismatch: number }
  /** PIP-737 (dev.12): segments moved before the braking, and the Panoramica entered with the last visit's data. */
  | { event: 'laps.segments', segments: number, badBounds: number }
  | { event: 'overview.remembered', changed: number, older: number }

type Bridge = { noteFeatureUse?: (note: FeatureUseNote) => void }

export function noteFeatureUse(note: FeatureUseNote) {
  // Una traccia non deve mai disturbare la pagina.
  try { (typeof window === 'undefined' ? null : (window as Window & { electronAPI?: Bridge }).electronAPI)?.noteFeatureUse?.(note) } catch { /* osservazione */ }
}
