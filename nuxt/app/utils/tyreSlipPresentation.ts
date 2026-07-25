import type { FastStateSlipState } from '~/composables/useFastStatePoller'

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