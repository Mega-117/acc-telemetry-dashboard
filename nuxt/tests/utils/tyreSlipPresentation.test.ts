import { describe, expect, it } from 'vitest'
import {
  TYRE_SLIP_STATE_LABELS,
  tyreSlipBarStyle,
  tyreSlipFillPercent,
  tyreSlipStateLabel,
} from '../../app/utils/tyreSlipPresentation'

describe('tyre slip presentation', () => {
  it('uses the same labels as the tyre HUD contract', () => {
    expect(TYRE_SLIP_STATE_LABELS).toEqual({
      ok: 'OK',
      limit: 'LIMITE',
      sliding: 'SCIVOLA',
      wheelspin: 'PATTINA',
      lockup: 'BLOCCAGGIO',
    })
  })

  it('shows WAIT instead of a slip judgement when telemetry is unavailable', () => {
    expect(tyreSlipStateLabel('ok', false)).toBe('WAIT')
    expect(tyreSlipStateLabel('limit', true)).toBe('LIMITE')
  })

  it('keeps the V1 fill formula and clamps it between 4 and 100 percent', () => {
    expect(tyreSlipFillPercent(null)).toBe(4)
    expect(tyreSlipFillPercent(-2)).toBe(4)
    expect(tyreSlipFillPercent(9)).toBe(50)
    expect(tyreSlipFillPercent(18)).toBe(100)
    expect(tyreSlipFillPercent(24)).toBe(100)
  })

  it('changes only the fill axis between classic and advanced HUDs', () => {
    expect(tyreSlipBarStyle(9)).toEqual({ width: '50%' })
    expect(tyreSlipBarStyle(9, 'vertical')).toEqual({ height: '50%' })
  })
})