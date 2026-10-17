// @vitest-environment jsdom
// PIP-555: il gateway vero, nel buco fra ingresso con profilo locale e cloud pronto.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const state = vi.hoisted(() => ({
  cloudReady: null as any,
  local: [] as any[],
  cached: null as any[] | null,
  userProjection: vi.fn(),
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ profileUser: ref({ uid: 'qa' }), userDisplayName: ref('QA'), cloudSessionReady: state.cloudReady }),
}))
vi.mock('~/composables/useGameContext', () => ({ useGameContext: () => ({ consultedGame: ref('acc') }) }))
vi.mock('~/composables/useTelemetryData', () => ({ useTelemetryData: () => ({}) }))
vi.mock('~/composables/useSessionPager', () => ({
  useSessionPager: () => ({}),
  loadLightweightSessionSource: vi.fn(async () => { throw new Error('no cloud read before the cloud is ready') }),
}))
vi.mock('~/composables/useFirebaseTracker', () => ({ startFirebaseScenario: () => 's', endFirebaseScenario: () => {} }))
vi.mock('~/repositories/telemetryLocalRepository', () => ({ loadLocalTelemetrySessions: async () => state.local }))
vi.mock('~/services/sync/sessionListProjectionService', () => ({ peekSessionListProjectionCache: () => state.cached }))
vi.mock('~/repositories/telemetryProjectionRepository', () => ({
  loadUserProjection: state.userProjection, loadTrackBest: vi.fn(), loadTrackBestsMap: vi.fn(),
  loadTrackDetailProjectionDoc: vi.fn(), loadOverviewSessionSummary: vi.fn(),
}))
vi.mock('~/services/session-detail/loadSessionDetailViewModel', () => ({ loadSessionDetailViewModel: vi.fn() }))

import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { OverviewNotReadyError } from '~/services/gateway/offlineOverviewPolicy'

const session = (id: string, date: string, syncState = 'synced') => ({
  sessionId: id, source: 'cloud', syncState,
  meta: { date_start: date, track: 'Kyalami', car: 'ferrari_296_gt3', gameId: 'acc', session_type: 0, sessionKind: 'practice' },
  summary: { totalTime: 600000, laps: 5 },
})

beforeEach(() => {
  state.cloudReady = ref(false)
  state.local = []
  state.cached = null
  state.userProjection.mockReset()
  ;(window as any).electronAPI = {}
})
afterEach(() => { delete (window as any).electronAPI })

describe('getOverviewProjection prima del cloud (PIP-555)', () => {
  it('archivio vuoto e nessuna cache: aspetta il cloud, nessuna lettura Firebase', async () => {
    const gateway = useTelemetryGateway('acc')
    await expect(gateway.getOverviewProjection('qa')).rejects.toBeInstanceOf(OverviewNotReadyError)
    expect(state.userProjection).not.toHaveBeenCalled()
  })

  it('lista in cache dal disco: la Panoramica la mostra subito, senza Firebase', async () => {
    state.cached = [session('2026_10_17T14_09_09_Kyalami', '2026-10-17T14:09:09')]
    const gateway = useTelemetryGateway('acc')
    const projection = await gateway.getOverviewProjection('qa')
    expect(projection?.lastCar.rawName).toBe('ferrari_296_gt3')
    expect(projection?.lastTrack?.name).toContain('Kyalami')
    expect(state.userProjection).not.toHaveBeenCalled()
  })

  it('solo file locali (nessuna cache): usa quelli, come prima', async () => {
    state.local = [session('local-1', '2026-10-17T10:00:00', 'pending_sync')]
    const projection = await useTelemetryGateway('acc').getOverviewProjection('qa')
    expect(projection?.lastCar.rawName).toBe('ferrari_296_gt3')
  })

  it('davvero offline: risponde "vuoto" invece di aspettare per sempre', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const projection = await useTelemetryGateway('acc').getOverviewProjection('qa')
    expect(projection?.lastTrack).toBeNull()
    online.mockRestore()
  })
})
