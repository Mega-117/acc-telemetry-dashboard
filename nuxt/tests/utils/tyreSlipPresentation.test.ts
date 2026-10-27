import { describe, expect, it } from 'vitest'
import { setLocale } from '~/i18n'
import {
  tyreSlipBarStyle,
  tyreSlipFillPercent,
  tyreSlipStateLabel,
} from '../../app/utils/tyreSlipPresentation'

// The Italian labels are the HUD contract; English is checked separately below.
setLocale('it')

describe('tyre slip presentation', () => {
  it('uses the same labels as the tyre HUD contract', () => {
    const states = ['ok', 'limit', 'sliding', 'wheelspin', 'lockup'] as const
    expect(Object.fromEntries(states.map(state => [state, tyreSlipStateLabel(state, true)]))).toEqual({
      ok: 'OK',
      limit: 'LIMITE',
      sliding: 'SCIVOLA',
      wheelspin: 'PATTINA',
      lockup: 'BLOCCAGGIO',
    })
    setLocale('en')
    expect(states.map(state => tyreSlipStateLabel(state, true))).toEqual(['OK', 'LIMIT', 'SLIDE', 'SPIN', 'LOCK'])
    setLocale('it')
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