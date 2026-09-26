// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { provideHeaderBack, useHeaderBack } from '~/composables/useHeaderBack'

describe('header return action', () => {
  it('uses the page callback, updates its label and clears on leaving', async () => {
    const run = vi.fn()
    const visible = ref(true)
    const label = ref('Torna alle piste')
    const Page = defineComponent({ setup() {
      const inHeader = useHeaderBack(run, () => label.value)
      return () => inHeader ? null : h('button', { class: 'local' }, 'Indietro')
    } })
    const Shell = defineComponent({ setup() {
      const back = provideHeaderBack()
      return () => h('div', [back.value && h('button', { onClick: back.value.run }, back.value.label()), visible.value && h(Page)])
    } })
    const wrapper = mount(Shell)
    await nextTick()
    expect(wrapper.find('.local').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(run).toHaveBeenCalledOnce()
    label.value = 'Torna alla sessione'
    await nextTick()
    expect(wrapper.get('button').text()).toBe(label.value)
    visible.value = false
    await nextTick()
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps inline returns available outside a dashboard shell', () => {
    let inHeader = true
    const wrapper = mount(defineComponent({ setup() {
      inHeader = useHeaderBack(vi.fn(), () => 'Indietro')
      return () => h('div')
    } }))
    expect(inHeader).toBe(false)
    wrapper.unmount()
  })

  it('does not clear the incoming action when an outgoing page unmounts later', async () => {
    const oldVisible = ref(true)
    const newVisible = ref(false)
    const page = (label: string) => defineComponent({ setup() {
      useHeaderBack(vi.fn(), () => label)
      return () => null
    } })
    const Old = page('Piste')
    const New = page('Sessioni')
    const wrapper = mount(defineComponent({ setup() {
      const back = provideHeaderBack()
      return () => h('div', [h('span', back.value?.label()), oldVisible.value && h(Old), newVisible.value && h(New)])
    } }))
    await nextTick()
    newVisible.value = true
    await nextTick()
    oldVisible.value = false
    await nextTick()
    expect(wrapper.get('span').text()).toBe('Sessioni')
    wrapper.unmount()
  })
})
