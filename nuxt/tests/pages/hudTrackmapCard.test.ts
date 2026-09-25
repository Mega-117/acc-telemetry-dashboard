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
    // Mirrors the main process: 1-600 s rounded, anything else becomes null.
    hudOverlaySaveSettings: vi.fn(async (_id: string, partial: Record<string, unknown>) => {
      if ('pitTimeSeconds' in partial) {
        const seconds = Number(partial.pitTimeSeconds)
        partial = {
          pitTimeSeconds: partial.pitTimeSeconds !== null && Number.isFinite(seconds) && seconds >= 1 && seconds <= 600
            ? Math.round(seconds) : null,
        }
      }
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
const pitTimeInput = () => wrapper!.get('input[aria-label^="Tempo perso per la sosta"]')

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
  it('hydrates from the saved settings and shows "auto" without a manual stop time', async () => {
    stored = { showPitPrediction: false, showCarNumbers: true, pitTimeSeconds: 47 }
    api = makeApi()
    Object.assign(window, { electronAPI: api })
    await openCard()
    expect(wrapper!.text()).toContain('Pit prediction')
    expect((pitTimeInput().element as HTMLInputElement).value).toBe('47')
    // Without pit prediction the manual time has nothing to drive.
    expect(pitTimeInput().attributes('disabled')).toBeDefined()
  })

  it('saves each option on the trackmap overlay and displays what the main process kept', async () => {
    await openCard()
    expect((pitTimeInput().element as HTMLInputElement).value).toBe('')
    expect(pitTimeInput().attributes('placeholder')).toBe('auto')

    const carNumbers = switches().find(input => input.element.closest('label')?.textContent?.includes('Numeri auto'))!
    await carNumbers.trigger('change'); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { showCarNumbers: true })

    const circle = switches().find(input => input.element.closest('label')?.textContent?.includes('Vista a cerchio'))!
    await circle.trigger('change'); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { circleView: true })
    expect((circle.element as HTMLInputElement).checked).toBe(true)

    await pitTimeInput().setValue('52.6'); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { pitTimeSeconds: 52.6 })
    expect((pitTimeInput().element as HTMLInputElement).value).toBe('53')

    await pitTimeInput().setValue('9999'); await flushPromises()
    expect((pitTimeInput().element as HTMLInputElement).value).toBe('')

    await pitTimeInput().setValue('40'); await flushPromises()
    await pitTimeInput().setValue(''); await flushPromises()
    expect(api.hudOverlaySaveSettings).toHaveBeenLastCalledWith('trackmap', { pitTimeSeconds: null })
    expect(stored.pitTimeSeconds).toBeNull()
  })
})
