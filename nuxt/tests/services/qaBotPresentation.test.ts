import { describe, expect, it } from 'vitest'
import { normalizeQaBotSnapshot, qaBotPresentation } from '~/services/overlay/qaBotPresentation'

describe('qa bot overlay presentation', () => {
  it.each([
    ['OFF', 'start', 'Attiva bot'],
    ['CHECKING', 'none', 'Verifica bot…'],
    ['ACTIVE', 'stop', 'Disattiva bot'],
    ['STOPPING', 'none', 'Arresto bot…'],
    ['BLOCKED', 'start', 'Attiva bot'],
    ['FAULT', 'start', 'Attiva bot'],
  ] as const)('maps %s to the safe action', (state, action, label) => {
    const snapshot = normalizeQaBotSnapshot({ state, reason: 'bot_off' })
    expect(qaBotPresentation(snapshot)).toMatchObject({ action, label })
  })

  it('fails closed for malformed state and translates frozen scenario blockers', () => {
    expect(normalizeQaBotSnapshot({ state: 'ALIEN' })).toMatchObject({
      state: 'BLOCKED',
      reason: 'qa_bot_state_unavailable',
    })
    expect(qaBotPresentation(normalizeQaBotSnapshot({
      state: 'BLOCKED',
      reason: 'auto_non_supportata ferrari_296_gt3',
    })).reason).toBe('Seleziona Mercedes-AMG GT3 Evo.')
  })

  it('shows dry-run explicitly and preserves bounded metrics', () => {
    const snapshot = normalizeQaBotSnapshot({
      state: 'ACTIVE',
      reason: 'bot_active',
      dryRun: true,
      lapsCompleted: 2,
      lapsValid: 1,
      speedKmh: 123.4,
      automaticGearbox: true,
    })
    expect(qaBotPresentation(snapshot).stateLabel).toContain('prova senza input')
    expect(snapshot).toMatchObject({
      lapsCompleted: 2,
      lapsValid: 1,
      speedKmh: 123.4,
      automaticGearbox: true,
    })
  })

  it('translates a missing Python dependency without exposing an internal code', () => {
    const snapshot = normalizeQaBotSnapshot({
      state: 'BLOCKED',
      reason: 'qa_bot_python_dependencies_missing',
    })
    expect(qaBotPresentation(snapshot).reason).toBe('Dipendenze Python del bot non disponibili.')
  })
})
