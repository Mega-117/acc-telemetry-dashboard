// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue'
import { mount } from '@vue/test-utils'
import { vRcSwitch } from '~/directives/rcSwitch'

const tab = ref<'a' | 'b' | null>('a')
const Switch = defineComponent({
  setup() {
    const item = (id: 'a' | 'b') => h('button', { 'type': 'button', 'aria-pressed': String(tab.value === id), 'onClick': () => { tab.value = id } }, id.toUpperCase())
    return () => withDirectives(h('div', { class: 'rc-switch' }, [item('a'), item('b')]), [[vRcSwitch]])
  },
})

const flush = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)) }

describe('v-rc-switch', () => {
  it('adds one sliding indicator, visible on the chosen item', () => {
    tab.value = 'a'
    const wrapper = mount(Switch)
    expect(wrapper.classes()).toContain('rc-switch--sliding')
    const indicators = wrapper.findAll('.rc-switch__indicator')
    expect(indicators).toHaveLength(1)
    expect((indicators[0]!.element as HTMLElement).style.opacity).toBe('1')
    expect(indicators[0]!.attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('follows the selection and hides with no item chosen', async () => {
    tab.value = 'a'
    const wrapper = mount(Switch)
    const indicator = wrapper.get('.rc-switch__indicator').element as HTMLElement
    await wrapper.findAll('button')[1]!.trigger('click')
    await flush()
    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
    expect(indicator.style.opacity).toBe('1')
    tab.value = null
    await flush()
    expect(indicator.style.opacity).toBe('0')
    wrapper.unmount()
  })
})
