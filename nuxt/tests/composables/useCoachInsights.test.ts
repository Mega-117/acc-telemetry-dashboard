import { describe, expect, it } from 'vitest'
import { useCoachInsights } from '~/composables/useCoachInsights'
import type { OverviewProjection } from '~/types/overviewProjections'

function makeActivityDay(overrides: Partial<OverviewProjection['activity7d'][number]> = {}): OverviewProjection['activity7d'][number] {
  return {
    date: '2026-06-18',
    dateLabel: '18/06',
    day: 'Gio',
    practice: 0,
    qualify: 0,
    race: 0,
    ...overrides
  }
}

describe('useCoachInsights', () => {
  it('degrada il briefing automatico quando i bucket recenti non hanno minuti misurabili', () => {
    const { generateDailySuggestion } = useCoachInsights()

    const suggestion = generateDailySuggestion([
      makeActivityDay(),
      makeActivityDay({ date: '2026-06-17', dateLabel: '17/06', day: 'Mer' })
    ])

    expect(suggestion.type).toBe('neutral')
    expect(suggestion.scenario).toBe('clean_laps')
    expect(suggestion.isDataDriven).toBe(false)
    expect(suggestion.message).toContain('registra una sessione')
  })

  it('marca come data-driven il briefing automatico quando ci sono minuti recenti', () => {
    const { generateDailySuggestion } = useCoachInsights()

    const suggestion = generateDailySuggestion([
      makeActivityDay({ practice: 50, qualify: 10, race: 5 })
    ])

    expect(suggestion.type).toBe('actionable')
    expect(suggestion.isDataDriven).toBe(true)
    expect(suggestion.scenario).toBe('race_real')
  })

  it('rispetta la scelta manuale anche con dati recenti assenti', () => {
    const { generateDailySuggestion } = useCoachInsights()

    const suggestion = generateDailySuggestion([makeActivityDay()], 'qualifying')

    expect(suggestion.type).toBe('actionable')
    expect(suggestion.isDataDriven).toBe(false)
    expect(suggestion.scenario).toBe('qualifying')
    expect(suggestion.message).toContain('Qualifica')
  })

  it('mantiene la lettura stato pilota neutra con dati recenti insufficienti', () => {
    const { generateDriverState } = useCoachInsights()

    const state = generateDriverState([makeActivityDay()])

    expect(state.type).toBe('neutral')
    expect(state.message).toContain('Nessuna attivita')
  })
})
