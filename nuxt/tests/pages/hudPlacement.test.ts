import { useGameContext } from '~/composables/useGameContext'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import RacingSwitch from '../../app/components/ui/RacingSwitch.vue'
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
function lockNow() { return wrapper!.get('.hud-placement-lock-now') }
async function render() { wrapper = mount(HudPage, { global: { components: { UiRacingSwitch: RacingSwitch } } }); await flushPromises() }
beforeEach(() => {
  useGameContext().selectGame('acc')
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
  it('keeps all six overlay panels reachable with their common controls', async () => {
    await render()
    const items = wrapper!.findAll('.hud-overlay-list__item')
    expect(items).toHaveLength(6)
    for (const item of items) {
      await item.trigger('click'); await flushPromises()
      expect(item.attributes('aria-current')).toBe('true')
      expect(wrapper!.find('.hud-settings [role="switch"]').exists()).toBe(true)
      expect(wrapper!.find('.hud-settings input[type="range"]').exists()).toBe(true)
    }
    expect(wrapper!.text()).toContain('Pit prediction')
    expect(wrapper!.text()).toContain('Vista a cerchio')
  })
  it('does not require a manual corner selection', async () => {
    await render()
    expect(wrapper!.find('select[aria-label="Angolo di apertura Ctrl+K"]').exists()).toBe(false)
  })

  it('PIP-504: no global unlock or "Sempre visibili"; the page explains the padlocks', async () => {
    await render()
    expect(wrapper!.find('button[aria-label="Blocca posizioni"]').exists()).toBe(false)
    expect(wrapper!.find('button[aria-label="Sempre visibili"]').exists()).toBe(false)
    expect(wrapper!.text()).toContain('apri il suo lucchetto')
    expect(wrapper!.text()).toContain('30 s senza trascinarlo')
    expect(wrapper!.find('.hud-placement-lock-now').exists()).toBe(false)
    expect(api.hudOverlaySetAllPlacement).not.toHaveBeenCalled()
  })

  it('PIP-504: "Blocca ora" appears while a padlock is open and only locks', async () => {
    active = true
    await render()
    expect(wrapper!.get('[role="status"]').text()).toContain('Posizionamento attivo')
    await lockNow().trigger('click'); await flushPromises()
    expect(api.hudOverlaySetAllPlacement.mock.calls).toEqual([[false]])
    expect(wrapper!.find('.hud-placement-lock-now').exists()).toBe(false)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })

  it('keeps "Blocca ora" available if locking fails, without claiming success', async () => {
    active = true
    api.hudOverlaySetAllPlacement.mockRejectedValueOnce(new Error('IPC unavailable'))
    await render()
    await lockNow().trigger('click'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('salvataggio e il blocco')
    expect(lockNow().attributes('disabled')).toBeUndefined()
    await lockNow().trigger('click'); await flushPromises()
    expect(active).toBe(false)
  })

  it('rejects an unconfirmed lock instead of displaying success', async () => {
    active = true
    api.hudOverlaySetAllPlacement.mockResolvedValueOnce(true)
    await render()
    await lockNow().trigger('click'); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('Impossibile confermare')
  })
})

it('filters EVO settings and restores ACC controls without writing preferences', async () => {
  useGameContext().selectGame('evo'); await render()
  const items = wrapper!.findAll('.hud-overlay-list__item')
  await items[4]!.trigger('click')
  expect(wrapper!.text()).toContain('Riepilogo personale')
  expect(wrapper!.find('[aria-label="Auto in testa"]').exists()).toBe(false)
  expect(wrapper!.text()).not.toContain('Numero auto')
  await items[5]!.trigger('click')
  expect(wrapper!.text()).toContain('Mappa circolare')
  expect(wrapper!.text()).not.toContain('Pit prediction')
  await items[3]!.trigger('click')
  expect(wrapper!.text()).not.toContain('Traffico uscita box')
  expect(wrapper!.text()).not.toContain('Danni')
  expect(wrapper!.text()).toContain('Tempo stint')
  useGameContext().selectGame('acc'); await flushPromises()
  expect(wrapper!.text()).toContain('Traffico uscita box')
})
