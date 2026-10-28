import type { FastOverlayState, FastStateSlipState } from '~/composables/useFastStatePoller'
import { useI18n, type TranslationKey } from '~/i18n'

// PIP-665: dictionary keys, resolved at display time in the interface language ('OK' is the same in both).
export const TYRE_SLIP_STATE_LABEL_KEYS: Record<Exclude<FastStateSlipState, 'ok'>, TranslationKey> = {
  limit: 'overlays.slip.limit',
  sliding: 'overlays.slip.sliding',
  wheelspin: 'overlays.slip.wheelspin',
  lockup: 'overlays.slip.lockup',
}

export function tyreSlipStateLabel(state: FastStateSlipState, hasData: boolean): string {
  if (!hasData) return 'WAIT'
  return state === 'ok' ? 'OK' : useI18n().t(TYRE_SLIP_STATE_LABEL_KEYS[state])
}

export type TyreSlipBarAxis = 'horizontal' | 'vertical'

// Classic aligned (28/10): the slip gauge is split into ten steps by thin separators drawn over
// it; the fill below them stays one continuous bar sized by tyreSlipFillPercent.
export const TYRE_SLIP_GAUGE_TICKS = 10

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
