import type { FastOverlayState, FastStateSlipState } from '~/composables/useFastStatePoller'

export const TYRE_SLIP_STATE_LABELS: Record<FastStateSlipState, string> = {
  ok: 'OK',
  limit: 'LIMITE',
  sliding: 'SCIVOLA',
  wheelspin: 'PATTINA',
  lockup: 'BLOCCAGGIO',
}

export function tyreSlipStateLabel(state: FastStateSlipState, hasData: boolean): string {
  return hasData ? TYRE_SLIP_STATE_LABELS[state] : 'WAIT'
}

export type TyreSlipBarAxis = 'horizontal' | 'vertical'

export function tyreSlipFillPercent(wheelSlipScaled: number | null | undefined): number {
  const scaled = typeof wheelSlipScaled === 'number' ? wheelSlipScaled : 0
  return Math.max(4, Math.min(100, (scaled / 18) * 100))
}

export function tyreSlipBarStyle(
  wheelSlipScaled: number | null | undefined,
  axis: TyreSlipBarAxis = 'horizontal',
): Partial<Record<'width' | 'height', string>> {
  const fill = `${tyreSlipFillPercent(wheelSlipScaled)}%`
  return axis === 'vertical' ? { height: fill } : { width: fill }
}

/**
 * Perche' l'HUD gomme non ha dati da mostrare, se non ne ha (PIP-270).
 *
 * Una regola sola per tutte le varianti: cambia solo il vocabolario con cui
 * ognuna la scrive a schermo. `data-unavailable` e' il caso spettatore: il
 * Broadcasting UDP non espone la fisica ruota dell'auto osservata, e non si
 * ricicla mai quella locale al suo posto.
 */
export type TyreHudStatus = 'no-data' | 'data-unavailable' | 'engine-off' | 'pit-limiter' | null

export function resolveTyreHudStatus(state: FastOverlayState): TyreHudStatus {
  if (!state.isLive) return 'no-data'
  if (state.dataSource === 'focused') return 'data-unavailable'
  if (!state.isEngineRunning) return 'engine-off'
  if (state.pitLimiterOn) return 'pit-limiter'
  return null
}
