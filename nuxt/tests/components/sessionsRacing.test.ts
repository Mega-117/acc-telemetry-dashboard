// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import SessioniPage from '~/components/pages/SessioniPage.vue'
import PaginationControls from '~/components/ui/PaginationControls.vue'
import ScrollArea from '~/components/ui/ScrollArea.vue'
import { installScrollbarActivity } from '~/services/ui/scrollbarActivity'
let disposeScrollbars: () => void

const fake = vi.hoisted(() => ({ gateway: null as any, uid: null as any }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => fake.gateway }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => fake.uid }))

const session = (id: string, date: string, type = 0, laps = 4, car = 'ferrari_296_gt3', track = 'imola') => ({
  sessionId: id, meta: { date_start: `${date}T10:30:00`, session_type: type, car, track },
  summary: { laps, lapsValid: laps, stintCount: 1, best_qualy_ms: 100782, best_session_race_ms: type === 2 ? 101957 : null },
})
const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const w = mount(SessioniPage, { attachTo: document.body, global: { components: { UiScrollArea: ScrollArea, UiPaginationControls: PaginationControls }, stubs: { LayoutPageContainer: { template: '<main><slot /></main>' } } } })
  wrappers.push(w)
  return w
}
beforeEach(() => {
  vi.useFakeTimers(); disposeScrollbars = installScrollbarActivity()
  vi.setSystemTime(new Date('2026-09-25T12:00:00'))
  fake.uid = ref('pilot')
  fake.gateway = {
    pagerSessions: ref([session('practice', '2026-09-25'), session('race', '2026-09-25', 2), session('qualify', '2026-09-24', 1), session('empty', '2026-09-23', 0, 0)]),
    pagerState: ref({ loading: false, currentPage: 1, totalItems: 30, hasNext: true }),
    pagerIsOnline: ref(true), pagerError: ref(null),
    getSessionsPage: vi.fn().mockImplementation(async (_uid, _filters, page) => { fake.gateway.pagerState.value.currentPage = page }),
  }
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(() => { disposeScrollbars(); wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers() })

describe('Sessioni racing single table', () => {
  it('shows the scrollbar only during scrolling and keeps pagination outside', async () => {
    const w = render(); await flushPromises()
    const area = w.get('.sessions-scroll')
    expect(area.find('.pagination').exists()).toBe(false)
    expect(area.classes()).not.toContain('is-scrolling')
    await area.trigger('scroll')
    expect(area.classes()).toContain('is-scrolling')
    await vi.advanceTimersByTimeAsync(500)
    await area.trigger('scroll')
    await vi.advanceTimersByTimeAsync(500)
    expect(area.classes()).toContain('is-scrolling')
    await vi.advanceTimersByTimeAsync(200)
    expect(area.classes()).not.toContain('is-scrolling')
    await area.trigger('scroll')
    w.unmount(); disposeScrollbars()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('scrolls only the designated list viewport when changing page', async () => {
    const container = document.createElement('main')
    container.dataset.pageScroll = ''
    container.scrollTo = vi.fn()
    const target = document.createElement('div')
    container.append(target)
    const w = mount(PaginationControls, { props: { currentPage: 1, totalPages: 3, totalItems: 60, scrollTarget: target } })
    wrappers.push(w)
    await w.get('[aria-label="Pagina 2"]').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })
  it('bounds pagination at the beginning, middle and end of very large archives', async () => {
    const w = mount(PaginationControls, { props: { currentPage: 1, totalPages: 10000000, totalItems: 250000000, variant: 'racing' } })
    wrappers.push(w)
    const labels = () => w.findAll('.page-btn').map(x => x.text())
    expect(labels()).toEqual(['1', '2', '3', '4', '5', '…', '10000000'])
    await w.setProps({ currentPage: 500 })
    expect(labels()).toEqual(['1', '…', '499', '500', '501', '…', '10000000'])
    expect(w.findAll('.pagination-gap').every(x => x.attributes('disabled') !== undefined)).toBe(true)
    await w.get('[aria-label="Pagina 501"]').trigger('click')
    expect(w.emitted('pageChange')).toEqual([[501]])
    await w.setProps({ currentPage: 10000000 })
    expect(labels()).toEqual(['1', '…', '9999996', '9999997', '9999998', '9999999', '10000000'])
    await w.setProps({ totalPages: 7, currentPage: 4 })
    expect(labels()).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })
  it('keeps default pagination hidden on one page and shows the racing summary', async () => {
    const w = mount(PaginationControls, { props: { currentPage: 1, totalPages: 1, totalItems: 4 } })
    wrappers.push(w)
    expect(w.find('.pagination').exists()).toBe(false)
    await w.setProps({ variant: 'racing' })
    expect(w.text()).toContain('4 elementi · Pagina 1 di 1')
    expect(w.get('[aria-label="Pagina precedente"]').attributes('disabled')).toBeDefined()
    expect(w.get('[aria-label="Pagina successiva"]').attributes('disabled')).toBeDefined()
    await w.get('[aria-label="Pagina 1"]').trigger('click')
    expect(w.emitted('pageChange')).toBeUndefined()
  })
  it('groups mixed session types by day and permanently excludes empty rows', async () => {
    const w = render(); await flushPromises()
    expect(w.findAll('caption').map(x => x.text())).toEqual(['25 SETTEMBRE 2026', '24 SETTEMBRE 2026'])
    expect(w.findAll('table')[0]!.findAll('tbody tr')).toHaveLength(2)
    expect(w.findAll('tbody tr')).toHaveLength(3)
    expect(w.findAll('select')).toHaveLength(4)
    expect(w.find('[title="Vista card"]').exists()).toBe(false)
    expect(w.find('input[type="checkbox"]').exists()).toBe(false)
    expect(fake.gateway.getSessionsPage).toHaveBeenCalledWith('pilot', expect.objectContaining({ hideEmpty: true }), 1, 25, false)
    expect(w.find('.session-best--race .is-empty').text()).toBe('–')
    expect(w.text()).toContain('1:41.957')
  })
  it('combines type, track, category, car and period using the existing debounced gateway', async () => {
    const w = render(); await flushPromises(); fake.gateway.getSessionsPage.mockClear()
    await w.findAll('.racing-filter-tabs button')[2]!.trigger('click')
    await w.get('[aria-label="Filtra pista"]').setValue('imola')
    await w.get('[aria-label="Filtra categoria auto"]').setValue('GT3')
    await w.get('[aria-label="Filtra auto"]').setValue('ferrari_296_gt3')
    await w.get('[aria-label="Filtra periodo"]').setValue('7d')
    expect(w.findAll('tbody tr')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(fake.gateway.getSessionsPage).toHaveBeenCalledTimes(1)
    expect(fake.gateway.getSessionsPage).toHaveBeenCalledWith('pilot', expect.objectContaining({ sessionTypes: [1], track: 'imola', carCategory: 'GT3', car: 'ferrari_296_gt3', fromDateIso: expect.any(String), hideEmpty: true }), 1, 25, true)
    expect(w.findAll('.racing-filter-tabs button')[2]!.attributes('aria-pressed')).toBe('true')
  })
  it('clears an incompatible car when the category changes', async () => {
    const w = render(); await flushPromises()
    await w.get('[aria-label="Filtra auto"]').setValue('ferrari_296_gt3')
    await w.get('[aria-label="Filtra categoria auto"]').setValue('TCX')
    expect((w.get('[aria-label="Filtra auto"]').element as HTMLSelectElement).value).toBe('all')
    expect(w.get('[aria-label="Filtra auto"]').text()).not.toContain('Ferrari 296')
  })
  it('opens the canonical detail exactly once from the accessible row button or the row', async () => {
    const w = render(); await flushPromises()
    expect(w.get('.session-open').attributes('aria-label')).toContain('Apri sessione PROVE LIBERE')
    await w.get('.session-open').trigger('click')
    expect(w.emitted('go-to-session')).toEqual([['practice']])
    await w.findAll('tbody tr')[1]!.trigger('click')
    expect(w.emitted('go-to-session')).toEqual([['practice'], ['race']])
  })
  it('paginates with hideEmpty still enabled and prevents requests while loading', async () => {
    const w = render(); await flushPromises(); fake.gateway.getSessionsPage.mockClear()
    fake.gateway.pagerState.value.loading = true; await nextTick()
    expect(w.get('[aria-label="Pagina successiva"]').attributes('disabled')).toBeDefined()
    fake.gateway.pagerState.value.loading = false; await nextTick()
    await w.get('[aria-label="Pagina successiva"]').trigger('click')
    await vi.advanceTimersByTimeAsync(500); await flushPromises()
    expect(fake.gateway.getSessionsPage).toHaveBeenCalledWith('pilot', expect.objectContaining({ hideEmpty: true }), 2, 25, false)
    expect(w.text()).toContain('Pagina 2 di 2')
  })
  it('distinguishes loading, empty, offline and failed reads with retry', async () => {
    fake.gateway.pagerSessions.value = []; fake.gateway.pagerState.value.loading = true
    const w = render(); await flushPromises()
    expect(w.text()).toContain('Caricamento sessioni')
    expect(w.text()).not.toContain('Nessuna sessione trovata')
    fake.gateway.pagerState.value.loading = false; fake.gateway.pagerIsOnline.value = false; await nextTick()
    expect(w.text()).toContain('Modalità offline')
    expect(w.text()).toContain('Nessuna sessione trovata')
    fake.gateway.pagerError.value = 'offline'; await nextTick()
    expect(w.get('[role="alert"]').text()).toContain('Impossibile caricare')
    await w.get('.racing-text-action').trigger('click')
    expect(fake.gateway.getSessionsPage).toHaveBeenLastCalledWith('pilot', expect.objectContaining({ hideEmpty: true }), 1, 25, true)
  })
  it('reloads the selected pilot on invalidation and respects local period filtering', async () => {
    const w = render(); await flushPromises(); fake.gateway.getSessionsPage.mockClear()
    await w.get('[aria-label="Filtra periodo"]').setValue('today')
    expect(w.findAll('tbody tr')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(300)
    fake.gateway.getSessionsPage.mockClear()
    window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', { detail: { uid: 'other' } }))
    expect(fake.gateway.getSessionsPage).not.toHaveBeenCalled()
    window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', { detail: { uid: 'pilot' } }))
    expect(fake.gateway.getSessionsPage).toHaveBeenCalledOnce()
  })
})
