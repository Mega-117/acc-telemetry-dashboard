// @vitest-environment jsdom
// 05/11 (user: "a beginner must get it"): words, not codes - segment and advice in plain words, the seconds at stake.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import SessionZonesCard from '~/components/session-detail/analysis/SessionZonesCard.vue'
import type { SessionZones } from '~/services/telemetry/sessionZones'

setLocale('it')

const zone = (n: number, extra: object) => ({ corner: { number: n }, spreadS: 0, potentialS: 0, mistakes: 0, mistakeLossS: 0, ...extra })
const insight = { laps: 7, zones: [zone(5, {})], mostMistakes: zone(5, { mistakes: 3, mistakeLossS: 16 }), mostPotential: zone(4, { potentialS: 0.21 }), leastConsistent: zone(2, { spreadS: 0.06 }) } as unknown as SessionZones

describe('SessionZonesCard', () => {
  it('only "Dove lavorare" on top; mistakes, potential, swing in words, the seconds on the right', () => {
    const view = mount(SessionZonesCard, { props: { insight, selected: null, totalLaps: 10 } })
    expect(view.get('h4').text()).toBe('Dove lavorare')
    expect(view.get('.zones__laps').text()).toBe('7 giri validi')
    expect(view.findAll('.zone-row').map(r => r.attributes('data-zone'))).toEqual(['mistakes', 'potential', 'consistency'])
    const card = (key: string) => view.get(`[data-zone="${key}"]`)
    expect(card('mistakes').get('.zone-title').text()).toBe('Segmento 5 · Qui sbagli spesso')
    expect(card('mistakes').get('.zone-sub').text()).toBe('3 giri rovinati su 10 (validi e non)')
    expect(card('mistakes').find('.zone-value').exists()).toBe(false)
    expect(card('potential').get('.zone-title').text()).toBe('Segmento 4 · Qui puoi guadagnare')
    expect(card('potential').get('.zone-value').text()).toBe('0.2 s')
    expect(card('consistency').get('.zone-title').text()).toBe('Segmento 2 · Qui non sei costante')
    expect(card('consistency').get('.zone-value').text()).toBe('0.06 s')
    view.unmount()
  })

  it('a click selects the corner; the selected card stands out; a card with nothing to say is disabled', async () => {
    const view = mount(SessionZonesCard, { props: { insight: { ...insight, leastConsistent: null }, selected: 4, totalLaps: 10 } })
    await view.get('[data-zone="mistakes"]').trigger('click')
    expect(view.emitted('select')).toEqual([[5]])
    expect(view.get('[data-zone="potential"]').classes()).toContain('active')
    const none = view.get('[data-zone="consistency"]')
    expect(none.attributes('disabled')).toBeDefined()
    expect(none.find('.zone-value').exists()).toBe(false)
    expect(none.get('.zone-title').text()).toBe('Qui non sei costante')
    expect(none.get('.zone-sub').text()).toBe('Nient’altro da segnalare')
    view.unmount()
  })

  it('with too few valid laps the page stays and says how many it needs', () => {
    const view = mount(SessionZonesCard, { props: { insight: { laps: 2, zones: [], mostMistakes: null, mostPotential: null, leastConsistent: null } as unknown as SessionZones, selected: null, totalLaps: 3 } })
    expect(view.get('h4').text()).toBe('Dove lavorare')
    expect(view.get('[data-testid="zones-few"]').text()).toBe('Servono almeno 4 giri validi per capire dove lavorare (ne hai 2).')
    expect(view.findAll('.zone-row')).toHaveLength(0)
    view.unmount()
  })
})
