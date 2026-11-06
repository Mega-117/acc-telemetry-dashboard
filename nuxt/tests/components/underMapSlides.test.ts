// @vitest-environment jsdom
// 05/11 (user): under the minimap, pages switched with dots (the stint, the session's advice).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import UnderMapSlides from '~/components/session-detail/analysis/UnderMapSlides.vue'

setLocale('it')

describe('UnderMapSlides', () => {
  it('one dot per page, the current one on; a click asks for that page; the slot gets the index', async () => {
    const view = mount(UnderMapSlides, { props: { labels: ['Il tuo stint', 'Consigli della sessione'], index: 0 },
      slots: { default: '<template #default="{ index }"><p class="page">page {{ index }}</p></template>' } })
    const dots = view.findAll('.under-map__dot')
    expect(dots).toHaveLength(2)
    expect(dots[0]!.attributes('aria-selected')).toBe('true')
    expect(view.get('.page').text()).toBe('page 0')
    await dots[1]!.trigger('click')
    expect(view.emitted('update:index')).toEqual([[1]])
    view.unmount()
  })

  it('pages slide in from the side of their dot, inside one stage (no height change)', async () => {
    const view = mount(UnderMapSlides, { props: { labels: ['A', 'B'], index: 0 }, slots: { default: '<p>page</p>' },
      global: { stubs: { transition: false } } })
    expect(view.find('.under-map__stage .under-map__page').exists()).toBe(true)
    await view.setProps({ index: 1 })
    expect(view.vm.$el.innerHTML).toContain('under-map-next')
    await view.setProps({ index: 0 })
    expect(view.vm.$el.innerHTML).toContain('under-map-prev')
    view.unmount()
  })

  it('a single page has no dots', () => {
    const view = mount(UnderMapSlides, { props: { labels: ['Il tuo stint'], index: 0 } })
    expect(view.find('.under-map__dots').exists()).toBe(false)
    view.unmount()
  })
})
