// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionAdvancedDebrief from '~/components/session-detail/SessionAdvancedDebrief.vue'

const EXPECTED_BANDS = [
  'adv-context',
  'adv-verdict',
  'adv-stints',
  'adv-pace',
  'adv-degradation',
  'adv-distribution',
  'adv-track-map',
  'adv-corner-detail',
  'adv-microsectors',
  'adv-telemetry',
  'adv-errors',
  'adv-plan',
  'adv-ranking',
  'adv-tyres',
  'adv-brakes',
  'adv-fuel',
  'adv-progression',
  'adv-skillmap',
  'adv-setup-ledger',
  'adv-lap-table',
  'adv-driver-debrief',
  'adv-team'
]

describe('SessionAdvancedDebrief', () => {
  it('renderizza tutte le bande del super-mockup nell\'ordine dichiarato', () => {
    const wrapper = mount(SessionAdvancedDebrief, {
      props: { usableLaps: 38, totalLaps: 47 }
    })

    for (const band of EXPECTED_BANDS) {
      expect(wrapper.find(`[data-testid="${band}"]`).exists(), band).toBe(true)
    }

    const html = wrapper.html()
    const positions = EXPECTED_BANDS.map(band => html.indexOf(`data-testid="${band}"`))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('dichiara il mock e usa la copertura giri reale passata dalle props', () => {
    const wrapper = mount(SessionAdvancedDebrief, {
      props: { usableLaps: 38, totalLaps: 47 }
    })

    expect(wrapper.text()).toContain('Mock esplorativo')
    expect(wrapper.get('[data-testid="adv-context"]').text()).toContain('38 / 47')
  })

  it('senza props di copertura mostra 0 / 0 senza rompersi', () => {
    const wrapper = mount(SessionAdvancedDebrief)

    expect(wrapper.get('[data-testid="adv-context"]').text()).toContain('0 / 0')
  })
})
