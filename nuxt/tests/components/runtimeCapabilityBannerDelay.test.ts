// @vitest-environment jsdom
// 06/11 (user: update messages that pop up and vanish in less than a second): an information card shows only when
// it lasts longer than 0.8 s; warnings show at once.
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RuntimeCapabilityBanner from '~/components/electron/RuntimeCapabilityBanner.vue'

vi.mock('~/composables/useRuntimeCapabilityGate', () => ({ useRuntimeCapabilityGate: () => ({ model: { value: { visible: false } }, connect: () => () => {} }) }))
const card = (tone: string, visible = true) => ({ visible, tone, title: 'Aggiornamento dati in corso', message: 'm', recovery: null, progress: null })
const opts = { global: { stubs: { teleport: true, transition: false } } }
afterEach(() => vi.useRealTimers())

describe('RuntimeCapabilityBanner delay', () => {
  it('a short information card never shows; a long one shows after 0.8 s', async () => {
    vi.useFakeTimers()
    const view = mount(RuntimeCapabilityBanner, { props: { model: card('info') as never }, ...opts })
    expect(view.find('section').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    await view.setProps({ model: card('info', false) as never })
    await vi.advanceTimersByTimeAsync(1000)
    expect(view.find('section').exists()).toBe(false)
    await view.setProps({ model: card('info') as never })
    await vi.advanceTimersByTimeAsync(799)
    expect(view.find('section').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(view.find('section').exists()).toBe(true)
  })
  it('a warning shows at once', async () => {
    const view = mount(RuntimeCapabilityBanner, { props: { model: card('warning') as never }, ...opts })
    expect(view.find('section').exists()).toBe(true)
  })
})
