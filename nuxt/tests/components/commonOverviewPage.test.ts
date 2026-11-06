// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import { ref, inject, shallowRef, watch, defineComponent, h, Suspense } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from '~/components/pages/PanoramicaPage.vue'
import { buildCommonOverviewProjection } from '~/services/projections/buildCommonOverviewProjection'

const mocks = vi.hoisted(() => ({ acc: vi.fn(), evo: vi.fn(), push: vi.fn() }))
const game = ref('acc'), owner = ref('qa'), cloudReady = ref(true)
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ cloudSessionReady: cloudReady }) }))
vi.mock('~/services/ui/pagePreparation', () => ({ preparePage: async (work: () => Promise<unknown>) => ({ ok: true, value: await work() }), preparePageFonts: async () => {}, rememberPage: () => {}, rememberedPage: () => undefined }))
vi.mock('~/repositories/raceCalendarRepository', () => ({ loadRaceCalendarEvents: async () => [] }))
vi.mock('~/composables/useGameContext', () => ({ useGameContext: () => ({ consultedGame: game }) }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => ref(null), useTargetUserId: () => owner }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getOverviewProjection: mocks.acc, getCommonOverviewProjection: mocks.evo }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
const projection = (name: string) => ({ ...buildCommonOverviewProjection([], 'evo'), lastCar: { rawName: name, displayName: name, lastUsedDate: 'Oggi' },
  lastTrack: { id: 'Monza', name: 'Monza', bestQualy: '1:20.000' }, lastSession: { id: name } })
beforeEach(() => { game.value = 'acc'; owner.value = 'qa'; cloudReady.value = true; vi.clearAllMocks() })
const stubs = { LayoutPageContainer: { template: '<main><slot /></main>' }, UiResponsiveImage: true, OverviewUpcomingRacesCard: true, CardsActivityCard: true, NuxtLink: true }
const cloudReadyEvent = () => window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', { detail: { uid: 'qa', scope: 'cloud-ready' } }))
// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

it('PIP-555: preparata prima del cloud senza dati resta in caricamento, poi carica al cloud-ready', async () => {
  cloudReady.value = false
  mocks.acc.mockResolvedValue(projection('Dal cloud'))
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: null, events: [], pending: true } }, global: { stubs } })
  await flushPromises()
  expect(wrapper.text()).toContain('Caricamento dati…')
  expect(wrapper.get('.last-drive').classes()).toContain('overview-placeholder')
  expect(mocks.acc).not.toHaveBeenCalled()
  cloudReady.value = true
  cloudReadyEvent()
  await flushPromises()
  expect(mocks.acc).toHaveBeenCalledTimes(1)
  expect(mocks.acc).toHaveBeenCalledWith('qa')
  expect(wrapper.text()).toContain('Dal cloud')
  wrapper.unmount()
})
it('PIP-555: il cloud e\' gia\' pronto quando la pagina si monta (evento perso): carica subito', async () => {
  cloudReady.value = true
  mocks.acc.mockResolvedValue(projection('Subito'))
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: null, events: [], pending: true } }, global: { stubs } })
  await flushPromises()
  expect(mocks.acc).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('Subito')
  cloudReadyEvent()
  await flushPromises()
  expect(mocks.acc).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('PIP-555: il cloud diventa pronto senza evento: la pagina si carica da sola, una volta', async () => {
  cloudReady.value = false
  mocks.acc.mockResolvedValue(projection('Da stato cloud'))
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: null, events: [], pending: true } }, global: { stubs } })
  await flushPromises()
  expect(mocks.acc).not.toHaveBeenCalled()
  cloudReady.value = true
  await flushPromises()
  cloudReadyEvent()
  await flushPromises()
  expect(mocks.acc).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('Da stato cloud')
  wrapper.unmount()
})
it('PIP-555: preparata con il cloud, un cloud-ready non la ricarica; una sync si\'', async () => {
  mocks.acc.mockResolvedValue(projection('Aggiornata'))
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: projection('Preparata'), events: [] } }, global: { stubs } })
  await flushPromises()
  cloudReadyEvent()
  await flushPromises()
  expect(mocks.acc).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Preparata')
  window.dispatchEvent(new CustomEvent('acc:telemetry-cache-invalidated', { detail: { uid: 'qa', scope: 'sync' } }))
  await flushPromises()
  expect(mocks.acc).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('Aggiornata')
  wrapper.unmount()
})
it('uses one layout, clears another game immediately and rejects its late response', async () => {
  let resolveAcc!: (value: unknown) => void
  mocks.acc.mockImplementation(() => new Promise(resolve => { resolveAcc = resolve }))
  mocks.evo.mockResolvedValue(projection('Ferrari EVO'))
  const wrapper = mount(Page, { global: { stubs: { LayoutPageContainer: { template: '<main><slot /></main>' },
    UiResponsiveImage: true, OverviewUpcomingRacesCard: true, CardsActivityCard: true, NuxtLink: true } } })
  game.value = 'evo'
  await flushPromises()
  expect(mocks.evo).toHaveBeenCalledWith('qa', 'evo')
  expect(wrapper.get('.last-drive__identity').text()).toContain('Ferrari EVO')
  expect(wrapper.findAll('.performance-table td')).toHaveLength(6)
  expect(wrapper.text()).toContain('Storico vettura · Qualifica')
  resolveAcc(projection('ACC delayed'))
  await flushPromises()
  expect(wrapper.text()).not.toContain('ACC delayed')
  await wrapper.get('.last-drive__actions .rc-btn--primary').trigger('click')
  expect(mocks.push).toHaveBeenCalledWith('/sessioni/Ferrari%20EVO')
  mocks.acc.mockResolvedValue({ ...projection('ACC current'), performanceColumns: undefined })
  game.value = 'acc'
  await flushPromises()
  expect(wrapper.text()).toContain('Storico GT3 · Qualifica')
  expect(wrapper.text()).not.toContain('Ferrari EVO')
  wrapper.unmount()
})
it('keeps exactly one overview mounted through route-level ACC/EVO switches', async () => {
  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('inject', inject)
  vi.stubGlobal('shallowRef', shallowRef)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }))
  mocks.acc.mockResolvedValue(null)
  game.value = 'evo'
  const Route = (await import('~/pages/panoramica.vue')).default
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(Route) }) }), {
    global: { stubs: { PagesPanoramicaPage: { template: '<div class="overview-instance">Overview</div>' }, LayoutPagePreparationError: true } },
  })
  await flushPromises()
  expect(wrapper.findAll('.overview-instance')).toHaveLength(1)
  game.value = 'acc'
  await flushPromises()
  expect(wrapper.findAll('.overview-instance')).toHaveLength(1)
  game.value = 'evo'
  await flushPromises()
  expect(wrapper.findAll('.overview-instance')).toHaveLength(1)
  wrapper.unmount()
  vi.unstubAllGlobals()
})
it('06/11: entrata con i dati della visita prima (stale) mostra subito quelli e poi carica i nuovi; un nuovo non viene mai ricoperto dal vecchio', async () => {
  cloudReady.value = true
  let resolveFresh: (p: unknown) => void = () => {}
  mocks.acc.mockImplementation(() => new Promise(r => { resolveFresh = r }))
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: projection('Visita prima') as never, events: [], stale: true } }, global: { stubs } })
  await flushPromises()
  expect(wrapper.text()).toContain('Visita prima')
  expect(mocks.acc).toHaveBeenCalledTimes(1)
  resolveFresh(projection('Sessione nuova'))
  await flushPromises()
  expect(wrapper.text()).toContain('Sessione nuova')
  expect(wrapper.text()).not.toContain('Visita prima')
  wrapper.unmount()
})
it('06/11: entrata preparata (non stale) non ricarica', async () => {
  cloudReady.value = true
  mocks.acc.mockResolvedValue(projection('Altro'))
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: projection('Preparata') as never, events: [] } }, global: { stubs } })
  await flushPromises()
  expect(mocks.acc).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Preparata')
  wrapper.unmount()
})
it('PIP-737 spy: after the fast entry the reload notes changed and never older; an older session is the KO', async () => {
  const notes: unknown[] = []
  vi.stubGlobal('electronAPI', { noteFeatureUse: (n: unknown) => notes.push(n) })
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { noteFeatureUse: (n: unknown) => notes.push(n) }
  cloudReady.value = true
  mocks.acc.mockResolvedValue(projection('2026_11_04T10_00_00_Monza'))
  const old = mount(Page, { props: { prepared: { uid: 'qa', projection: projection('2026_11_05T10_00_00_Monza') as never, events: [], stale: true } }, global: { stubs } })
  await flushPromises()
  expect(notes.at(-1)).toEqual({ event: 'overview.remembered', changed: 1, older: 1 })
  old.unmount()
  mocks.acc.mockResolvedValue(projection('2026_11_06T10_00_00_Monza'))
  const fresh = mount(Page, { props: { prepared: { uid: 'qa', projection: projection('2026_11_05T10_00_00_Monza') as never, events: [], stale: true } }, global: { stubs } })
  await flushPromises()
  expect(notes.at(-1)).toEqual({ event: 'overview.remembered', changed: 1, older: 0 })
  fresh.unmount()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
  vi.unstubAllGlobals()
})
