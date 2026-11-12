// @vitest-environment jsdom
// PIP-767: the Panoramica's "Ultima sessione" decides where to go at the click (the real page, a real click).
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setLocale } from '~/i18n'
import Page from '~/components/pages/PanoramicaPage.vue'
import { buildCommonOverviewProjection } from '~/services/projections/buildCommonOverviewProjection'

const mocks = vi.hoisted(() => ({ acc: vi.fn(), evo: vi.fn(), newest: vi.fn(), push: vi.fn(), note: vi.fn() }))
const game = ref('acc'), owner = ref('qa'), coach = ref<string | null>(null)
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ cloudSessionReady: ref(true) }) }))
vi.mock('~/services/ui/pagePreparation', () => ({ preparePage: async (work: () => Promise<unknown>) => ({ ok: true, value: await work() }), preparePageFonts: async () => {}, rememberPage: () => {}, rememberedPage: () => undefined }))
vi.mock('~/repositories/raceCalendarRepository', () => ({ loadRaceCalendarEvents: async () => [] }))
vi.mock('~/composables/useGameContext', () => ({ useGameContext: () => ({ consultedGame: game }) }))
vi.mock('~/composables/usePilotContext', () => ({ usePilotContext: () => coach, useTargetUserId: () => owner }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getOverviewProjection: mocks.acc, getCommonOverviewProjection: mocks.evo, findNewestOwnSession: mocks.newest }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('~/services/usage/featureUseNote', () => ({ noteFeatureUse: mocks.note }))
setLocale('it')

const RACE = { id: 'race-11-11', date: '2026-11-11T21:43:13' }
const PRACTICE = { id: 'practice-12-11', date: '2026-11-12T09:48:46.920' }
const projection = (last: { id: string; date: string } | null) => ({ ...buildCommonOverviewProjection([], 'acc'),
  lastCar: { rawName: 'mercedes_amg_gt4', displayName: 'Mercedes', lastUsedDate: 'Ieri' },
  lastTrack: { id: 'brands_hatch', name: 'Brands Hatch' }, lastSession: last ? { ...last, car: 'm', track: 'b' } : null })
const stubs = { LayoutPageContainer: { template: '<main><slot /></main>' }, UiResponsiveImage: true, OverviewUpcomingRacesCard: true, CardsActivityCard: true, NuxtLink: true }

async function pageShowing(last: { id: string; date: string } | null) {
  const wrapper = mount(Page, { props: { prepared: { uid: 'qa', projection: projection(last), events: [] } }, global: { stubs } })
  await flushPromises()
  return wrapper
}
const button = (wrapper: Awaited<ReturnType<typeof pageShowing>>) => wrapper.get('.rc-btn--primary')

beforeEach(() => {
  game.value = 'acc'; owner.value = 'qa'; coach.value = null
  vi.clearAllMocks()
  ;(window as any).electronAPI = {}
})
afterEach(() => { delete (window as any).electronAPI })

it('Marik 12/11: page built on yesterday\'s race, a session driven since: the click opens the running one', async () => {
  mocks.newest.mockResolvedValue({ local: PRACTICE, newestStart: PRACTICE.date, checked: true })
  const wrapper = await pageShowing(RACE)
  expect(button(wrapper).text()).toContain('Ultima sessione')
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.newest).toHaveBeenCalledWith('qa', 'acc')
  expect(mocks.push).toHaveBeenCalledWith(`/sessioni/${PRACTICE.id}`)
  expect(mocks.note).toHaveBeenCalledWith({ event: 'overview.last_session', newer: 1, behind: 0, fallback: 0 })
  expect(button(wrapper).text()).toContain('Ultima sessione')
  wrapper.unmount()
})

it('nothing newer on this computer (no lap yet in the new session): the session the page shows', async () => {
  mocks.newest.mockResolvedValue({ local: null, newestStart: RACE.date, checked: true })
  const wrapper = await pageShowing(RACE)
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.push).toHaveBeenCalledWith(`/sessioni/${RACE.id}`)
  expect(mocks.note).toHaveBeenCalledWith({ event: 'overview.last_session', newer: 0, behind: 0, fallback: 0 })
  wrapper.unmount()
})

it('the program does not answer in time: the session the page shows, marked as not checked (the KO)', async () => {
  mocks.newest.mockResolvedValue({ local: null, newestStart: null, checked: false })
  const wrapper = await pageShowing(RACE)
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.push).toHaveBeenCalledWith(`/sessioni/${RACE.id}`)
  expect(mocks.note).toHaveBeenCalledWith({ event: 'overview.last_session', newer: 0, behind: 0, fallback: 1 })
  wrapper.unmount()
})

it('first session ever: the page has none to show, the button still opens the one driven', async () => {
  mocks.newest.mockResolvedValue({ local: PRACTICE, newestStart: PRACTICE.date, checked: true })
  const wrapper = await pageShowing(null)
  expect(button(wrapper).attributes('disabled')).toBeUndefined()
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.push).toHaveBeenCalledWith(`/sessioni/${PRACTICE.id}`)
  wrapper.unmount()
})

it('a double click asks once and navigates once', async () => {
  let answer!: (value: unknown) => void
  mocks.newest.mockReturnValue(new Promise(resolve => { answer = resolve }))
  const wrapper = await pageShowing(RACE)
  await button(wrapper).trigger('click')
  await button(wrapper).trigger('click')
  answer({ local: PRACTICE, newestStart: PRACTICE.date, checked: true })
  await flushPromises()
  expect(mocks.newest).toHaveBeenCalledTimes(1)
  expect(mocks.push).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('an answer arriving after the owner changed is dropped', async () => {
  let answer!: (value: unknown) => void
  mocks.newest.mockReturnValue(new Promise(resolve => { answer = resolve }))
  mocks.acc.mockResolvedValue(projection(RACE))
  const wrapper = await pageShowing(RACE)
  await button(wrapper).trigger('click')
  owner.value = 'other'
  answer({ local: PRACTICE, newestStart: PRACTICE.date, checked: true })
  await flushPromises()
  expect(mocks.push).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('a coach viewing a pilot: no read of this computer, the pilot\'s session as before', async () => {
  coach.value = 'pilot'
  const wrapper = await pageShowing(RACE)
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.newest).not.toHaveBeenCalled()
  expect(wrapper.emitted('go-to-session')).toEqual([[RACE.id]])
  expect(mocks.note).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('in the browser (no program): the session the page shows, no read, no note', async () => {
  delete (window as any).electronAPI
  const wrapper = await pageShowing(RACE)
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.newest).not.toHaveBeenCalled()
  expect(mocks.push).toHaveBeenCalledWith(`/sessioni/${RACE.id}`)
  expect(mocks.note).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('the newest session could not be opened, an older one is: the spy says behind (the KO), not newer', async () => {
  mocks.newest.mockResolvedValue({ local: { id: 'race-10-11', date: '2026-11-10T20:00:00' }, newestStart: PRACTICE.date, checked: true })
  const wrapper = await pageShowing({ id: 'race-09-11', date: '2026-11-09T20:00:00' })
  await button(wrapper).trigger('click')
  await flushPromises()
  expect(mocks.push).toHaveBeenCalledWith('/sessioni/race-10-11')
  expect(mocks.note).toHaveBeenCalledWith({ event: 'overview.last_session', newer: 1, behind: 1, fallback: 0 })
  wrapper.unmount()
})
