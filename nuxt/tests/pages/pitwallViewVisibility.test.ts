// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as hostAccess from '~/utils/devToolsAccess'
import Page from '~/pages/pitwall.vue'

vi.mock('~/components/pitwall/PitwallV4Local.vue', () => ({ default: { template: '<div data-view="v4-local" />' } }))
vi.mock('~/components/pages/PitwallPage.vue', () => ({ default: { template: '<div data-view="legacy" />' } }))
vi.mock('~/components/pitwall/concept/PitwallConcept.vue', () => ({ default: { template: '<div data-view="pitwall" />' } }))
vi.mock('~/composables/usePitwallConceptState', () => ({ usePitwallConceptState: vi.fn() }))
vi.mock('~/composables/usePitwallStore', () => ({ providePitwallStore: vi.fn() }))
const actualIsDevToolsHost = hostAccess.isDevToolsHost
let legacy = ref(false)
beforeEach(() => {
  legacy = ref(false)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useRoute', () => ({ query: {} }))
  vi.stubGlobal('useState', (key: string, init: () => unknown) => key === 'pitwall-legacy-active' ? legacy : ref(init()))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['racercore-develop.pages.dev', 'mega-117.github.io'])('removes the entire switch and ignores stale Legacy on %s', async (host) => {
  vi.spyOn(hostAccess, 'isDevToolsHost').mockImplementation(() => actualIsDevToolsHost(host))
  legacy.value = true
  const wrapper = mount(Page)
  try {
    await flushPromises()
    expect(wrapper.find('.pitwall-view-switch').exists()).toBe(false)
    expect(wrapper.find('[data-view="pitwall"]').exists()).toBe(true)
    expect(wrapper.find('[data-view="legacy"]').exists()).toBe(false)
    expect(wrapper.find('[data-view="v4-local"]').exists()).toBe(false)
    expect(wrapper.element.children).toHaveLength(1)
  } finally { wrapper.unmount() }
})
it.each(['localhost', '127.0.0.1', '::1'])('preserves all view controls on %s', async (host) => {
  vi.spyOn(hostAccess, 'isDevToolsHost').mockImplementation(() => actualIsDevToolsHost(host))
  const wrapper = mount(Page)
  try {
    await flushPromises()
    const buttons = wrapper.findAll('.pitwall-view-switch button')
    expect(buttons.map(button => button.text())).toEqual(['Pit Wall', 'Legacy', 'V4 locale'])
    await buttons[1]!.trigger('click')
    expect(wrapper.find('[data-view="legacy"]').exists()).toBe(true)
    await buttons[2]!.trigger('click')
    expect(wrapper.find('[data-view="v4-local"]').exists()).toBe(true)
    await buttons[0]!.trigger('click')
    expect(wrapper.find('[data-view="pitwall"]').exists()).toBe(true)
  } finally { wrapper.unmount() }
})
