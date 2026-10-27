// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import PitwallLocalCrew from '~/components/pitwall/PitwallLocalCrew.vue'
import { setLocale } from '~/i18n'

// These tests read the Italian texts (jsdom defaults to English).
setLocale('it')

const fake = vi.hoisted(() => ({ standings: null as any, fast: null as any }))
vi.mock('~/composables/useOverlayRegionApi', () => ({ useOverlayRegionApi: () => () => ({}) }))
vi.mock('~/composables/useStandingsState', () => ({ useStandingsState: () => fake.standings }))
vi.mock('~/composables/useFastStatePoller', () => ({ useFastStatePoller: () => fake.fast }))
beforeEach(() => {
  const identity = { track: 'Spa', variant: 'short', car: 'QA' }
  fake.standings = { start: vi.fn(), stop: vi.fn(), nowMs: ref(10000), state: ref({ status: 'available', snapshot: {
    schema: 'racercore.standings', game_id: 'synthetic', session_id: 'one', identity,
    freshness: { generated_at_ms: 10000, ttl_ms: 1000 }, session: { local_car_index: 2 },
    cars: [{ car_index: 2, race_number: 12, has_identity: true, has_realtime: true, realtime_updated_at_ms: 10000,
      current_driver_index: 0, drivers: [{ first_name: 'QA', last_name: 'Driver' }, {}] }],
  } }) }
  fake.fast = { startFastStatePolling: vi.fn(), stopFastStatePolling: vi.fn(), fastState: ref({ commonLive: {
    gameId: 'synthetic', sessionId: 'one', fresh: true, connected: true, lifecycle: 'live', identity, capabilities: { standings: true },
  } }) }
})
it('presents local simulator drivers without membership or command controls and releases both leases', () => {
  const view = mount(PitwallLocalCrew)
  expect(view.text()).toContain('Vettura locale · #12')
  expect(view.text()).toContain('QA Driver')
  expect(view.text()).toContain('Nome non disponibile')
  expect(view.findAll('small')).toHaveLength(1)
  expect(view.findAll('button')).toHaveLength(0)
  view.unmount()
  expect(fake.standings.stop).toHaveBeenCalledOnce()
  expect(fake.fast.stopFastStatePolling).toHaveBeenCalledOnce()
})
it.each(['stale', 'wrong-session', 'spectator', 'unsupported'])('removes invalidated local facts: %s', async mode => {
  const view = mount(PitwallLocalCrew)
  if (mode === 'stale') fake.standings.nowMs.value = 11001
  if (mode === 'wrong-session') fake.fast.fastState.value.commonLive.sessionId = 'two'
  if (mode === 'spectator') fake.standings.state.value.snapshot.session.local_car_index = null
  if (mode === 'unsupported') fake.fast.fastState.value.commonLive.capabilities.standings = false
  await nextTick()
  expect(view.find('section').exists()).toBe(false)
  view.unmount()
})
it('does not invent an active driver when the source index is unknown', () => {
  fake.standings.state.value.snapshot.cars[0].current_driver_index = null
  const view = mount(PitwallLocalCrew)
  expect(view.findAll('small')).toHaveLength(0)
  view.unmount()
})
