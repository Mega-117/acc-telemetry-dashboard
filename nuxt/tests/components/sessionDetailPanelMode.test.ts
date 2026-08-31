// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionDetailPanelMode from '~/components/session-detail/SessionDetailPanelMode.vue'

describe('SessionDetailPanelMode', () => {
  it('mantiene Standard come default e cambia solo il pannello destro', async () => {
    const wrapper = mount(SessionDetailPanelMode, {
      props: {
        stintNumber: 2,
        stintType: 'R',
        laps: [
          { lap: 1, valid: true, pit: false },
          { lap: 2, valid: false, pit: false },
          { lap: 3, valid: true, pit: true }
        ]
      },
      slots: {
        default: '<div data-testid="standard-content">Contenuto standard esistente</div>'
      }
    })

    const standardTab = wrapper.get('#session-detail-standard-tab')
    const advancedTab = wrapper.get('#session-detail-advanced-tab')
    const standardPanel = wrapper.get('#session-detail-standard-panel')

    expect(standardTab.attributes('aria-selected')).toBe('true')
    expect(standardPanel.attributes('style') ?? '').not.toContain('display: none')
    expect(wrapper.get('[data-testid="standard-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-advanced-preview"]').exists()).toBe(false)

    await advancedTab.trigger('click')

    expect(advancedTab.attributes('aria-selected')).toBe('true')
    expect(standardPanel.attributes('style')).toContain('display: none')
    const advancedPanel = wrapper.get('[data-testid="session-advanced-preview"]')
    expect(advancedPanel.text()).toContain('Debrief allenamento')
    expect(advancedPanel.text()).toContain('1 / 3')
    expect(advancedPanel.text()).toContain('Mock esplorativo')

    await standardTab.trigger('click')

    expect(standardTab.attributes('aria-selected')).toBe('true')
    expect(standardPanel.attributes('style') ?? '').not.toContain('display: none')
  })

  it('emette mode-change a ogni cambio reale di modalita', async () => {
    const wrapper = mount(SessionDetailPanelMode, {
      props: { stintNumber: 1, stintType: 'Q', laps: [] },
      slots: { default: '<div>Standard</div>' }
    })

    const advancedTab = wrapper.get('#session-detail-advanced-tab')

    await advancedTab.trigger('click')
    // Click ripetuto sulla stessa modalita': nessun evento duplicato.
    await advancedTab.trigger('click')
    await wrapper.get('#session-detail-standard-tab').trigger('click')

    expect(wrapper.emitted('mode-change')).toEqual([['advanced'], ['standard']])
  })

  it('aggiorna il contesto dello stint senza cambiare la modalità scelta', async () => {
    const wrapper = mount(SessionDetailPanelMode, {
      props: { stintNumber: 1, stintType: 'Q', laps: [] },
      slots: { default: '<div>Standard</div>' }
    })

    await wrapper.get('#session-detail-advanced-tab').trigger('click')
    await wrapper.setProps({ stintNumber: 4, stintType: 'R' })

    expect(wrapper.get('#session-detail-advanced-tab').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[data-testid="session-advanced-preview"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Gara · Stint #4')
  })
})
