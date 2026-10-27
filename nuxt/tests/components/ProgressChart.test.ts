// @vitest-environment jsdom
// PIP-633: i tempi del grafico "Stai migliorando?" sono leggibili anche come testo (tastiera, lettore di schermo).
import { describe, expect, it } from 'vitest'
import { setLocale } from '~/i18n'
import { mount } from '@vue/test-utils'
import ProgressChart from '~/components/stats/ProgressChart.vue'
import type { SessionDocument } from '~/types/telemetry'

const NOW = new Date(2026, 9, 26, 18, 0).getTime()
const session = (day: number, race: number): SessionDocument => ({
  meta: { date_start: new Date(2026, 9, day, 20).toISOString(), track: 'monza', car: 'ferrari_296_gt3', session_type: 2, gameId: 'acc' },
  summary: { totalTime: 3_600_000, laps: 20, lapsValid: 18, bestLap: race, best_race_ms: race },
} as unknown as SessionDocument)

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('ProgressChart', () => {
  it('lists every session time in a text list, in date order, marking the record', () => {
    const w = mount(ProgressChart, { props: { sessions: [session(20, 101_000), session(10, 102_000), session(24, 100_500)], nowMs: NOW } })
    const items = w.findAll('.progress__list li').map(li => li.text())
    expect(items).toHaveLength(3)
    expect(items[0]).toContain('10/10/26')
    expect(items[2]).toContain('24/10/26')
    expect(items[2]).toContain('record')
    expect(items[0]).not.toContain('record')
    expect(w.get('.progress__list summary').text()).toBe('Elenco delle sessioni (3)')
  })

  it('has no list when there is nothing to chart', () => {
    const w = mount(ProgressChart, { props: { sessions: [], nowMs: NOW } })
    expect(w.find('.progress__list').exists()).toBe(false)
  })
})
