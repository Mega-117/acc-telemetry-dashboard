import { describe, expect, it } from 'vitest'
import { correctionNote, fuelPerMinute, lapsLeft, wheelCorrection } from '~/utils/boxEngineer'
import { normalizeTyreSetupViewModel, type PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'

const plan = (over: Partial<PressureRecommendationViewModel> = {}): PressureRecommendationViewModel => ({
  status: 'ready', eligible: true, needsAdjustment: true, completedLaps: 4, requiredCompletedLaps: 3, planId: 'p',
  targetPsi: 27.1, clicks: { FL: 3, FR: 0, RL: -2, RR: null }, ...over,
})

describe('Box (ACC Drive ENGINEER) numbers', () => {
  it('fuel per minute is consumption per lap over the reference lap', () => {
    expect(fuelPerMinute(3, 120000)).toBe(1.5)
    expect(fuelPerMinute(null, 120000)).toBeNull()
    expect(fuelPerMinute(3, 0)).toBeNull()
  })

  it('laps left are whole laps to start at the reference pace, else the ACC lap limit', () => {
    expect(lapsLeft(10 * 60000 + 30000, 100000, null)).toBe(6)
    expect(lapsLeft(0, 100000, 12)).toBe(12)
    expect(lapsLeft(null, null, null)).toBeNull()
  })

  it('wheel correction: + add air, - remove, 0 ok, unknown wheel --', () => {
    expect(wheelCorrection(plan(), 'FL')).toEqual({ text: '+0.3', tone: 'add' })
    expect(wheelCorrection(plan(), 'FR')).toEqual({ text: '0.0', tone: 'ok' })
    expect(wheelCorrection(plan(), 'RL')).toEqual({ text: '-0.2', tone: 'remove' })
    expect(wheelCorrection(plan(), 'RR')).toEqual({ text: '--', tone: 'none' })
    expect(wheelCorrection(null, 'FL')).toEqual({ text: '--', tone: 'none' })
  })

  it('reads the logger plan through the normalizer: clicks in tenths of psi', () => {
    // Shape published by logger_core/tyre_pressure_recommendation.py in fast_state.tyre_setup.
    const raw = { pressure_recommendation: { status: 'ready', completed_laps: 3, required_completed_laps: 3, target_psi: 30.5,
      wheels: { FL: { clicks: -4, compensated_psi: 30.9 }, FR: { clicks: 0 }, RL: { clicks: 2 }, RR: { clicks: 1 } } } }
    const recommendation = normalizeTyreSetupViewModel(raw).pressureRecommendation
    expect(wheelCorrection(recommendation, 'FL')).toEqual({ text: '-0.4', tone: 'remove' })
    expect(wheelCorrection(recommendation, 'RL')).toEqual({ text: '+0.2', tone: 'add' })
    expect(correctionNote(recommendation)).toBe('Da correggere verso 30.5 psi')
  })

  it('the note says when the correction is available and towards which target', () => {
    expect(correctionNote(null)).toBe('In attesa del primo giro completo')
    expect(correctionNote(plan({ completedLaps: 1 }))).toBe('Disponibile dopo 3 giri dello stint (1/3)')
    expect(correctionNote(plan())).toBe('Da correggere verso 27.1 psi')
    expect(correctionNote(plan({ status: 'within_tolerance' }))).toBe('Nella finestra: target 27.1 psi')
    expect(correctionNote(plan({ status: 'click_limit_exceeded' }))).toBe('Correzione troppo grande: controlla il setup')
    expect(correctionNote(plan({ status: 'waiting_for_stability' }))).toBe('In attesa di due giri stabili')
  })
})
