// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PistePage from '~/components/pages/PistePage.vue'

const mock = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getTracksOverviewProjection: mock.load }) }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => ref('pilot') }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks() })

describe('Piste racing grid', () => {
  it('keeps played and unplayed cards accessible and opens the existing track route', async () => {
    mock.load.mockResolvedValue([
      { id: 'imola', name: 'Imola', sessions: 1, lastSession: '2026-09-25', image: '/imola.png', bestQualy: '1:40.200', bestRace: '1:41.100' },
      { id: 'spa', name: 'Spa', sessions: 0 },
    ])
    wrapper = mount(PistePage, { global: { stubs: { LayoutPageContainer: { template: '<main><slot /></main>' } } } })
    await flushPromises()
    expect(wrapper.text()).toContain('1 piste visitate su 2 totali')
    expect(wrapper.findAll('.track-card')).toHaveLength(2)
    expect(wrapper.find('.view-toggle').exists()).toBe(false)
    expect(wrapper.find('.tracks-list').exists()).toBe(false)
    expect(wrapper.find('h1').exists()).toBe(false)
    const empty = wrapper.get('a[href="/piste/spa"]')
    expect(empty.classes()).toContain('track-card--unplayed')
    expect(empty.attributes('aria-label')).toBe('Dettaglio pista Spa')
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
