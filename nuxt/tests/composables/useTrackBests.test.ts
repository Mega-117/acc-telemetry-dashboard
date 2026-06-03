import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// ─── Firebase / config mocks ────────────────────────────────────────────────
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: vi.fn(),
  trackedGetDocs: vi.fn(),
  trackedSetDoc: vi.fn(),
  trackedDeleteDoc: vi.fn(),
  trackedWriteBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
}))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: any[]) => args[0]),
  where: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
}))
vi.mock('~/services/sync/trackBestsProjectionService', () => ({
  TRACK_BESTS_SCHEMA_VERSION: 1,
}))
vi.mock('~/services/telemetry/activityProjectionService', () => ({
  getTrackActivityTotalsFromSessions: vi.fn(() => ({})),
}))

// ─── Auth mock ───────────────────────────────────────────────────────────────
const mockCurrentUser = ref<{ uid: string } | null>(null)
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ currentUser: mockCurrentUser }),
}))

// ─── Import dopo i mock ───────────────────────────────────────────────────────
import { useTrackBests, globalPrefetchComplete } from '~/composables/useTrackBests'
import { globalSessions } from '~/composables/useSessionLoader'

// ─────────────────────────────────────────────────────────────────────────────

describe('useTrackBests', () => {
  beforeEach(() => {
    mockCurrentUser.value = { uid: 'user-tb' }
    globalSessions.value = []
    globalPrefetchComplete.value = false
    vi.clearAllMocks()

    // Pulisci sessionStorage tra i test
    if (typeof window !== 'undefined') {
      sessionStorage.clear()
    }
  })

  // ───────────────────────────────────────────────────
  describe('calculateAllBestTimesForTrack', () => {
    it('ritorna bests vuoti e lastSessionDate null se non ci sono sessioni', async () => {
      const { calculateAllBestTimesForTrack } = useTrackBests()
      const result = await calculateAllBestTimesForTrack('monza')

      expect(result.lastSessionDate).toBeNull()
      // Tutte le grip/category sono inizializzate ma con valori null
      const firstCat = Object.values(result.bests)[0]
      const firstGrip = Object.values(firstCat)[0]
      expect(firstGrip.bestQualy).toBeNull()
      expect(firstGrip.bestRace).toBeNull()
    })

    it('calcola bestQualy dalla sessione piu recente', async () => {
      globalSessions.value = [
        {
          sessionId: 'sess-001',
          meta: {
            track: 'Monza',
            car: 'BMW M4 GT3',
            date_start: '2024-06-01T10:00:00',
          },
          summary: {
            best_by_grip: {
              Fast: {
                bestQualy: 92000,
                bestQualyTemp: 24,
                bestQualyFuel: 10,
              },
            },
          },
        } as any,
      ]

      const { calculateAllBestTimesForTrack } = useTrackBests()
      const result = await calculateAllBestTimesForTrack('monza')

      expect(result.lastSessionDate).toBe('2024-06-01T10:00:00')

      // Trova la categoria GT3 nella struttura
      const gt3Key = Object.keys(result.bests).find(k => k.toLowerCase().includes('gt3'))
      if (gt3Key) {
        expect(result.bests[gt3Key as any].Fast.bestQualy).toBe(92000)
        expect(result.bests[gt3Key as any].Fast.bestQualyTemp).toBe(24)
        expect(result.bests[gt3Key as any].Fast.bestQualySessionId).toBe('sess-001')
      }
    })

    it('tiene il best piu basso tra piu sessioni', async () => {
      globalSessions.value = [
        {
          sessionId: 'sess-slow',
          meta: { track: 'Spa', car: 'BMW M4 GT3', date_start: '2024-05-01' },
          summary: {
            best_by_grip: { Optimum: { bestQualy: 140000, bestQualyTemp: 20, bestQualyFuel: 5 } },
          },
        } as any,
        {
          sessionId: 'sess-fast',
          meta: { track: 'Spa', car: 'BMW M4 GT3', date_start: '2024-05-02' },
          summary: {
            best_by_grip: { Optimum: { bestQualy: 135000, bestQualyTemp: 22, bestQualyFuel: 5 } },
          },
        } as any,
      ]

      const { calculateAllBestTimesForTrack } = useTrackBests()
      const result = await calculateAllBestTimesForTrack('spa')

      const gt3Key = Object.keys(result.bests).find(k => k.toLowerCase().includes('gt3'))
      if (gt3Key) {
        expect(result.bests[gt3Key as any].Optimum.bestQualy).toBe(135000)
        expect(result.bests[gt3Key as any].Optimum.bestQualySessionId).toBe('sess-fast')
      }
    })
  })

  // ───────────────────────────────────────────────────
  describe('invalidateTrackBests', () => {
    it('esiste e puo essere chiamato senza errori', () => {
      const { invalidateTrackBests } = useTrackBests()
      expect(() => invalidateTrackBests('monza')).not.toThrow()
    })

    it('invalidateTrackBests("*") non lancia e getTrackBests ritorna una Promise', async () => {
      const { invalidateTrackBests, getTrackBests } = useTrackBests()

      // Verifica che invalidateTrackBests('*') non lanci
      expect(() => invalidateTrackBests('*')).not.toThrow()

      // getTrackBests e async: dopo invalidazione ritorna una Promise (non null)
      const result = getTrackBests('monza')
      expect(result).toBeInstanceOf(Promise)
      // La Promise deve risolvere in un oggetto (anche vuoto)
      const resolved = await result
      expect(resolved).toBeDefined()
      expect(typeof resolved).toBe('object')
    })
  })

  // ───────────────────────────────────────────────────
  describe('getTrackBests', () => {
    it('ritorna una Promise che si risolve in un oggetto quando non ci sono dati in cache', async () => {
      const { getTrackBests } = useTrackBests()
      const result = getTrackBests('nurburgring')
      // getTrackBests e async: ritorna sempre una Promise, mai null direttamente
      expect(result).toBeInstanceOf(Promise)
      const resolved = await result
      expect(resolved).toBeDefined()
      expect(typeof resolved).toBe('object')
    })
  })

  // ───────────────────────────────────────────────────
  describe('prefetchAllTrackBests', () => {
    it('esiste e ritorna una Promise', () => {
      const { prefetchAllTrackBests } = useTrackBests()
      expect(typeof prefetchAllTrackBests).toBe('function')
      const result = prefetchAllTrackBests()
      expect(result).toBeInstanceOf(Promise)
    })
  })
})
