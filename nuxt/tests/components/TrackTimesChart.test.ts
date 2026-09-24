// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import TrackTimesChart from '../../app/components/charts/TrackTimesChart.vue'
import TrackDetailPage from '../../app/components/pages/TrackDetailPage.vue'

const gateway = vi.hoisted(() => ({ getTrackDetailProjection: vi.fn() }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => gateway }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => ref(null) }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))

vi.mock('vue-chartjs', () => ({ Line: { name: 'Line', props: ['data', 'options'], template: '<canvas />' } }))
const history = Array.from({ length: 20 }, (_, i) => ({
  sessionId: `2026_09_20T12_${String(i).padStart(2, '0')}_00_nurburgring`, date: '20 set', bestRace: i === 10 ? '2:41.500' : '1:54.000',
}))
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 24, 12)) })
afterEach(() => vi.useRealTimers())

describe('TrackTimesChart controls and consumer data', () => {
  it('defaults to 30 days and Focus; exposes the original outside value and restores it with one click', async () => {
    const wrapper = mount(TrackTimesChart, { props: { history } })
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('30')
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Focus')
    expect(wrapper.text()).toContain('1 tempo fuori scala')
    expect(wrapper.get('details').text()).toContain('2:41.500')
    let chart = wrapper.findComponent({ name: 'Line' })
    expect(chart.props('data').datasets[2].pointRadius.every((radius: number) => radius === 0)).toBe(true)
    expect(chart.props('data').datasets[2].data[10].y).toBe(null)
    expect(chart.props('data').datasets[3].data[0].original).toBe(161.5)
    await wrapper.get('.track-times__notice button').trigger('click')
    chart = wrapper.findComponent({ name: 'Line' })
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Completa')
    expect(chart.props('data').datasets[2].data[10].y).toBe(161.5)
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.text()).toContain('1 tempo fuori scala')
    wrapper.unmount()
  })
  it('handles empty recent periods and offers available history, with markers for sparse points', async () => {
    const wrapper = mount(TrackTimesChart, { props: { history: [{ ...history[0]!, dateStart: '2026-01-01T12:00:00' }] } })
    expect(wrapper.text()).toContain('Nessun tempo disponibile nel periodo selezionato')
    expect(wrapper.find('canvas').exists()).toBe(false)
    await wrapper.get('.track-times__empty button').trigger('click')
    expect(wrapper.text()).toContain('fino a 200 sessioni')
    expect(wrapper.findComponent({ name: 'Line' }).props('data').datasets[2].pointRadius).toEqual([3])
    wrapper.unmount()
  })
  it('changes only presentation state, reacts to incoming data and represents loading and truly empty data', async () => {
    const wrapper = mount(TrackTimesChart, { props: { history, loading: true } })
    expect(wrapper.text()).toContain('Caricamento tempi')
    await wrapper.setProps({ loading: false })
    await wrapper.get('select').setValue('90')
    expect(wrapper.findComponent({ name: 'Line' }).props('data').datasets[2].data).toHaveLength(20)
    await wrapper.setProps({ history: [] })
    await wrapper.get('select').setValue('all')
    expect(wrapper.text()).toContain('Nessun tempo disponibile.')
    expect(wrapper.emitted('update:history')).toBeUndefined()
    expect(history[10]?.bestRace).toBe('2:41.500')
    wrapper.unmount()
  })
  it('reports undated sessions instead of silently including them in recent periods', () => {
    const wrapper = mount(TrackTimesChart, { props: { history: [{ sessionId: 'unknown', date: '20 set', bestQualy: '1:54.000' }] } })
    expect(wrapper.text()).toContain('1 sessione senza data completa')
    wrapper.unmount()
  })
  it('keeps an isolated ordinary point visible between two clipped times in a dense series', () => {
    const data = history.map((point, i) => ({ ...point, bestRace: i === 9 || i === 11 ? '2:41.500' : '1:54.000' }))
    const wrapper = mount(TrackTimesChart, { props: { history: data } })
    const radii = wrapper.findComponent({ name: 'Line' }).props('data').datasets[2].pointRadius
    expect(radii[10]).toBe(3)
    expect(radii[0]).toBe(0)
    wrapper.unmount()
  })
  it('wires real page data without refetching or changing cards/list when chart controls change', async () => {
    gateway.getTrackDetailProjection.mockReset().mockResolvedValue({
      historicalTimes: history,
      recentSessions: [{ id: 'session-link', date: '2026-09-20', time: '12:00', type: 'race', car: 'car', laps: 8, stints: 1, bestRace: '1:54.000' }],
      activity: { sessionCount: 117, totalLaps: 1213, validLaps: 931, validPercent: 77, totalTimeFormatted: '37h 30m' },
    })
    const wrapper = mount(TrackDetailPage, { props: { trackId: 'nurburgring' }, global: { stubs: { LayoutPageContainer: { template: '<main><slot /></main>' } } } })
    await flushPromises()
    expect(gateway.getTrackDetailProjection).toHaveBeenCalledTimes(1)
    const header = wrapper.get('.track-header-activity').text()
    const sessions = wrapper.get('.sessions-list').text()
    const cards = wrapper.get('aside').text()
    await wrapper.get('[aria-label="Periodo del grafico"]').setValue('7')
    await wrapper.get('.track-times__toggle button:last-child').trigger('click')
    await flushPromises()
    expect(gateway.getTrackDetailProjection).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.track-header-activity').text()).toBe(header)
    expect(wrapper.get('.sessions-list').text()).toBe(sessions)
    expect(wrapper.get('aside').text()).toBe(cards)
    expect(wrapper.get('.session-row').attributes('href')).toBe('/sessioni/session-link')
    wrapper.unmount()
  })
})
