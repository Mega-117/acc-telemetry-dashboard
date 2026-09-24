// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import HudPage from '../../app/pages/hud.vue'

vi.mock('~/composables/useHudOverlay', () => ({ getHudOverlayScaleMin: () => 0.5, getHudOverlayScaleMax: () => 3 }))
vi.mock('~/utils/hudRoutePerformance', () => ({
  afterHudNextPaint: async () => {}, markHudRoutePhase: () => {},
  finishHudRouteTiming: () => ({}), formatHudRouteTimingSummary: () => '',
}))

let wrapper: VueWrapper | undefined
let active: boolean
let api: ReturnType<typeof makeApi>
function makeApi() {
  return {
    hudOverlayOpen: vi.fn(),
    hudOverlayIsOpen: vi.fn(async () => true),
    hudOverlayGetSettings: vi.fn(async () => ({ enabled: true })),
    hudOverlayGetPlacementStatus: vi.fn(async () => ({ active, deadlineMs: active ? Date.now() + 60000 : null })),
    hudOverlaySetAllPlacement: vi.fn(async (value: boolean) => { active = value; return value }),
    trainingOverlayGetSettings: vi.fn(async () => ({ originCorner: 'bottom-right' })),
    trainingOverlaySetOriginCorner: vi.fn(async (originCorner: string) => ({ originCorner })),
  }
}
function buttons() { return wrapper!.findAll('.test-hud__placement-actions button') }
async function render() { wrapper = mount(HudPage); await flushPromises() }
beforeEach(() => {
  vi.stubGlobal('definePageMeta', vi.fn())
  active = false
  api = makeApi()
  Object.assign(window, { electronAPI: api })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  delete (window as any).electronAPI
  vi.unstubAllGlobals()
})

describe('HUD placement commands', () => {
  it('does not require a manual corner selection', async () => {
    await render()
    expect(wrapper!.find('select[aria-label="Angolo di apertura Ctrl+K"]').exists()).toBe(false)
  })

  it('supports Edit / Save / Edit using confirmed runtime state', async () => {
    await render()
    await buttons()[0]!.trigger('click'); await flushPromises()
    expect(buttons()[1]!.attributes('disabled')).toBeUndefined()
    await buttons()[1]!.trigger('click'); await flushPromises()
    expect(wrapper!.text()).toContain('Posizioni salvate e bloccate.')
    await buttons()[0]!.trigger('click'); await flushPromises()
    expect(api.hudOverlaySetAllPlacement.mock.calls).toEqual([[true], [false], [true]])
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows failure and allows a successful retry', async () => {
    api.hudOverlaySetAllPlacement.mockRejectedValueOnce(new Error('IPC unavailable'))
    await render()
    await buttons()[0]!.trigger('click'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Impossibile confermare la modifica')
    expect(buttons()[0]!.attributes('disabled')).toBeUndefined()
    await buttons()[0]!.trigger('click'); await flushPromises()
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(active).toBe(true)
  })

  it('keeps Save available if saving fails, without claiming success', async () => {
    active = true
    api.hudOverlaySetAllPlacement.mockRejectedValueOnce(new Error('IPC unavailable'))
    await render()
    await buttons()[1]!.trigger('click'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('salvataggio e il blocco')
    expect(buttons()[1]!.text()).toBe('Salva e blocca')
    expect(buttons()[1]!.attributes('disabled')).toBeUndefined()
  })

  it('disables both commands while awaiting the runtime', async () => {
    let complete!: (value: boolean) => void
    api.hudOverlaySetAllPlacement.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await render()
    await buttons()[0]!.trigger('click')
    expect(buttons().every(button => button.attributes('disabled') !== undefined)).toBe(true)
    active = true; complete(true); await flushPromises()
    expect(api.hudOverlaySetAllPlacement).toHaveBeenCalledTimes(1)
    expect(buttons()[1]!.attributes('disabled')).toBeUndefined()
  })

  it('reports status read failure while retaining the acknowledged command state', async () => {
    await render()
    api.hudOverlayGetPlacementStatus.mockRejectedValue(new Error('read failed'))
    await buttons()[0]!.trigger('click'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Impossibile confermare')
    expect(buttons()[1]!.attributes('disabled')).toBeUndefined()
  })

  it('rejects an unconfirmed response instead of displaying success', async () => {
    api.hudOverlaySetAllPlacement.mockResolvedValueOnce(false)
    await render()
    await buttons()[0]!.trigger('click'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Impossibile confermare')
    expect(buttons()[0]!.attributes('disabled')).toBeUndefined()
  })
})
