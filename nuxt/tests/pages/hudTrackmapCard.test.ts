// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import HudPage from '../../app/pages/hud.vue'

vi.mock('~/composables/useHudOverlay', () => ({ getHudOverlayScaleMin: () => 0.6, getHudOverlayScaleMax: () => 1.6 }))
vi.mock('~/utils/hudRoutePerformance', () => ({
  afterHudNextPaint: async () => {}, markHudRoutePhase: () => {},
  finishHudRouteTiming: () => ({}), formatHudRouteTimingSummary: () => '',
}))

let wrapper: VueWrapper | undefined
let stored: Record<string, unknown>
let api: ReturnType<typeof makeApi>

function makeApi() {
  return {
    hudOverlayOpen: vi.fn(),
    hudOverlayIsOpen: vi.fn(async () => false),
    hudOverlayGetSettings: vi.fn(async (id: string) => id === 'trackmap' ? { enabled: true, ...stored } : { enabled: false }),
    hudOverlayGetPlacementStatus: vi.fn(async () => ({ active: false, deadlineMs: null })),
    hudOverlaySaveSettings: vi.fn(async (_id: string, partial: Record<string, unknown>) => {
      stored = { ...stored, ...partial }
      return { enabled: true, ...stored }
    }),
  }
}

async function openCard() {
  wrapper = mount(HudPage)
  await flushPromises()
  const entry = wrapper.findAll('.hud-overlay-list__item').find(button => button.text().includes('Minimappa'))
  expect(entry, 'voce Minimappa assente').toBeTruthy()
  await entry!.trigger('click')
  await flushPromises()
}
const switches = () => wrapper!.findAll('input[type="checkbox"]')

beforeEach(() => {
  vi.stubGlobal('definePageMeta', vi.fn())
  stored = { showPitPrediction: true, showCarNumbers: false, pitTimeSeconds: null }
  api = makeApi()
  Object.assign(window, { electronAPI: api })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  delete (window as any).electronAPI
  vi.unstubAllGlobals()
})

describe('HUD settings: Minimappa card', () => {
  it('ignores old manual settings and never exposes a stop-time input', async () => {
    stored = { showPitPrediction: false, showCarNumbers: true, pitTimeSeconds: 47 }
    api = makeApi()
    Object.assign(window, { electronAPI: api })
    await openCard()
    expect(wrapper!.text()).toContain('Pit prediction')
    expect(wrapper!.text()).not.toContain('Tempo sosta manuale')
    expect(wrapper!.find('input[type="number"]').exists()).toBe(false)
  })

  it('saves each option on the trackmap overlay and displays what the main process kept', async () => {
    await openCard()
    const carNumbers = switches().find(input => input.element.closest('label')?.textContent?.includes('Numeri auto'))!
    await carNumbers.trigger('change'); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { showCarNumbers: true })

    const circle = switches().find(input => input.element.closest('label')?.textContent?.includes('Vista a cerchio'))!
    await circle.trigger('change'); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { circleView: true })
    expect((circle.element as HTMLInputElement).checked).toBe(true)

    const prediction = switches().find(input => input.element.closest('label')?.textContent?.includes('Pit prediction'))!
    await prediction.trigger('change'); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { showPitPrediction: false })
    expect(api.hudOverlaySaveSettings.mock.calls.every(([, partial]) => !('pitTimeSeconds' in partial))).toBe(true)
  })
})
