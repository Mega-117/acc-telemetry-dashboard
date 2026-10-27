// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PistePage from '~/components/pages/PistePage.vue'
import { useGameContext } from '~/composables/useGameContext'

const mock = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getVehicleHistory: mock.load }) }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => ref('pilot') }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))
vi.stubGlobal('useState', (_key: string, init: () => unknown) => ref(init()))
const row = (id: string, game: string, track: string) => ({ sessionId: id, meta: { gameId: game, track, car: 'Ferrari', date_start: '2026-09-25', session_type: 0 }, summary: { laps: 1 } })
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks() })

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('Piste racing grid', () => {
  it('discards old-game responses after switching while a load is pending', async () => {
    useGameContext().selectGame('acc')
    let oldResult!: (value: any) => void
    mock.load.mockImplementationOnce(() => new Promise(resolve => { oldResult=resolve }))
      .mockResolvedValueOnce([row('evo', 'evo', 'Monza')])
    wrapper=mount(PistePage,{global:{stubs:{LayoutPageContainer:{template:'<main><slot /></main>'}}}})
    useGameContext().selectGame('evo')
    await flushPromises()
    oldResult([row('acc', 'acc', 'OLD ACC')])
    await flushPromises()
    expect(wrapper.text()).toContain('Monza')
    expect(wrapper.text()).not.toContain('OLD ACC')
    wrapper.unmount()
    useGameContext().selectGame('acc')
  })
  it('hydrates filter data even when route preparation supplied cards', () => {
    mock.load.mockResolvedValue([])
    wrapper = mount(PistePage, { props: { initialTracks: [{ id: 'spa', name: 'Spa', sessions: 0 }] as any }, global: { stubs: { LayoutPageContainer: { template: '<main><slot /></main>' } } } })
    expect(wrapper.text()).toContain('Spa')
    expect(mock.load).toHaveBeenCalledTimes(1)
  })
  it('keeps played and unplayed cards accessible and opens the existing track route', async () => {
    mock.load.mockResolvedValue([
      row('imola-session', 'acc', 'imola'),
    ])
    wrapper = mount(PistePage, { global: { stubs: { LayoutPageContainer: { template: '<main><slot /></main>' } } } })
    await flushPromises()
    expect(wrapper.text()).toMatch(/1 piste visitate su \d+ totali/)
    expect(wrapper.findAll('.track-card').length).toBeGreaterThan(10)
    expect(wrapper.find('.view-toggle').exists()).toBe(false)
    expect(wrapper.find('.tracks-list').exists()).toBe(false)
    expect(wrapper.find('h1').exists()).toBe(false)
    const empty = wrapper.get('a[href="/piste/spa"]')
    expect(empty.classes()).toContain('track-card--unplayed')
    expect(wrapper.get('a[href="/piste/imola"]').classes()).not.toContain('track-card--unplayed')
    expect(empty.attributes('aria-label')).toBe('Dettaglio pista Spa-Francorchamps')
    await empty.trigger('click')
    expect(wrapper.emitted('go-to-track')).toEqual([['spa']])
    window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', { detail: { uid: 'other' } }))
    await flushPromises()
    expect(mock.load).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', { detail: { uid: 'pilot' } }))
    await flushPromises()
    expect(mock.load).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    window.dispatchEvent(new Event('acc:telemetry-cache-invalidated'))
    expect(mock.load).toHaveBeenCalledTimes(2)
  })
})
