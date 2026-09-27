// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import Lock from '~/components/overlay/OverlayPlacementLock.vue'
import { OVERLAY_REGION_API } from '~/composables/useOverlayRegionApi'

function setup(initial: boolean | Promise<boolean> = false) {
  let notify: (active: boolean) => void = () => {}
  const off = vi.fn()
  const api = {
    hudOverlayGetPlacement: vi.fn(() => Promise.resolve(initial)),
    hudOverlaySetPlacement: vi.fn((_id: string, active: boolean) => Promise.resolve(active)),
    onHudOverlayPlacement: vi.fn((fn: typeof notify) => { notify = fn; return off }),
  }
  const wrapper = mount(Lock, { props: { overlayId: 'tyres' }, global: { provide: { [OVERLAY_REGION_API as symbol]: () => api } } })
  return { api, wrapper, notify: (active: boolean) => notify(active), off }
}

it('unlocks only its overlay, receives auto-lock and removes its listener', async () => {
  const t = setup(); await flushPromises()
  expect(t.wrapper.get('button').attributes('aria-pressed')).toBe('false')
  await t.wrapper.get('button').trigger('click'); await flushPromises()
  expect(t.api.hudOverlaySetPlacement).toHaveBeenCalledWith('tyres', true)
  expect(t.wrapper.get('button').attributes('aria-pressed')).toBe('true')
  t.notify(false); await flushPromises()
  expect(t.wrapper.get('button').attributes('aria-pressed')).toBe('false')
  t.wrapper.unmount(); expect(t.off).toHaveBeenCalledOnce()
})

it('retains the unlocked state and reports a failed save', async () => {
  const t = setup(true); await flushPromises()
  t.api.hudOverlaySetPlacement.mockRejectedValueOnce(new Error('disk full'))
  await t.wrapper.get('button').trigger('click'); await flushPromises()
  expect(t.wrapper.get('button').attributes('aria-pressed')).toBe('true')
  expect(t.wrapper.get('[role="alert"]').text()).toContain('non salvata')
  await t.wrapper.get('button').trigger('click'); await flushPromises()
  expect(t.wrapper.get('button').attributes('aria-pressed')).toBe('false')
  t.wrapper.unmount()
})

it('a late initial response cannot overwrite a newer placement event', async () => {
  let resolve!: (value: boolean) => void
  const t = setup(new Promise<boolean>(r => { resolve = r }))
  t.notify(true); resolve(false); await flushPromises()
  expect(t.wrapper.get('button').attributes('aria-pressed')).toBe('true')
  t.wrapper.unmount()
})
