// @vitest-environment jsdom
// 05/11 (user): the strip on top of the charts - sectors "Settore 1" (S1 when narrow), corners, big ◀ ▶ when something is open.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import TraceStrip from '~/components/session-detail/analysis/TraceStrip.vue'

setLocale('it')
const sectors = [0, 1, 2].map(i => ({ index: i, left: i * 33.3, width: 33.3 }))
const corners = [{ number: 1, lost: 0.2, left: 5, width: 10 }, { number: 2, lost: -0.1, left: 40, width: 10 }]

describe('TraceStrip', () => {
  it('writes the sector in full and short (the box width picks one), a click asks for it', async () => {
    const view = mount(TraceStrip, { props: { sectors, corners, selectedSector: null, selectedCorner: null, canStep: false } })
    const first = view.findAll('[data-testid="strip-sector"]')[0]!
    expect(first.get('.strip-long').text()).toBe('Settore 1')
    expect(first.get('.strip-short').text()).toBe('S1')
    await first.trigger('click')
    expect(view.emitted('sector')).toEqual([[0]])
    expect(view.find('[data-testid="strip-prev"]').exists()).toBe(false)
    view.unmount()
  })

  it('◀ ▶ only while a sector or corner is open, and they ask for a step', async () => {
    const view = mount(TraceStrip, { props: { sectors, corners, selectedSector: 1, selectedCorner: null, canStep: true } })
    await view.get('[data-testid="strip-prev"]').trigger('click')
    await view.get('[data-testid="strip-next"]').trigger('click')
    expect(view.emitted('step')).toEqual([[-1], [1]])
    // 06/11 (user): the label says what the arrows step.
    expect(view.get('[data-testid="strip-next"]').attributes('aria-label')).toBe('Settore successivo')
    await view.setProps({ selectedSector: null, selectedCorner: 2 })
    expect(view.get('[data-testid="strip-prev"]').attributes('aria-label')).toBe('Segmento precedente')
    const corner = view.findAll('.strip-row--corners button')
    expect(corner[0]!.classes()).toContain('loss')
    expect(corner[1]!.classes()).toContain('gain')
    view.unmount()
  })
})
