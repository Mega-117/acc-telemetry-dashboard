// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { vi, it, expect } from 'vitest'
import { useGameContext } from '~/composables/useGameContext'
import Page from '~/pages/pitwall.vue'
const started = vi.hoisted(() => vi.fn())
vi.mock('~/components/pitwall/PitwallAvailablePage.vue', () => ({ default: { setup() { started(); return {} }, template: '<div>Operational rooms</div>' } }))
it('never mounts room content under EVO, even when placeholder DOM is removed', async () => {
  vi.stubGlobal('definePageMeta', vi.fn())
  useGameContext().selectGame('evo')
  const w = mount(Page); await flushPromises()
  expect(started).not.toHaveBeenCalled()
  w.get('[data-testid="pitwall-unavailable"]').element.remove()
  expect(w.text()).not.toContain('Operational rooms')
  expect(started).not.toHaveBeenCalled()
  w.unmount()
  useGameContext().selectGame('acc')
  const acc = mount(Page); await flushPromises()
  expect(started).toHaveBeenCalledOnce()
  expect(acc.text()).toContain('Operational rooms')
  useGameContext().selectGame('evo'); await flushPromises()
  expect(acc.text()).not.toContain('Operational rooms')
  acc.unmount(); useGameContext().selectGame('acc'); vi.unstubAllGlobals()
})
