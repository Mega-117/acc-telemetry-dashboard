import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// ─── Firebase / config mocks ────────────────────────────────────────────────
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: vi.fn(),
  trackedGetDocs: vi.fn(),
}))
vi.mock('~/repositories/telemetryLocalRepository', () => ({
  loadLocalTelemetrySessions: vi.fn(async () => []),
  findLocalFullSessionById: vi.fn(async () => null),
}))
vi.mock('~/repositories/telemetryCloudRepository', () => ({
  loadCloudSessionsBounded: vi.fn(async () => []),
  loadCloudSessionIndexList: vi.fn(async () => []),
  fetchCloudFullSession: vi.fn(async () => null),
}))
vi.mock('~/services/telemetry/telemetryMergeService', () => ({
  dedupeCloudSessions: vi.fn((sessions: any[]) => sessions),
  mergeSessionsDeterministic: vi.fn((local: any[], cloud: any[]) => [...local, ...cloud]),
}))

// ─── Auth mock ───────────────────────────────────────────────────────────────
const mockCurrentUser = ref<{ uid: string } | null>(null)
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ currentUser: mockCurrentUser }),
}))

// ─── Import dopo i mock ───────────────────────────────────────────────────────
import {
  useSessionLoader,
  globalSessions,
  globalIsLoading,
  globalError,
  globalLastUserId,
} from '~/composables/useSessionLoader'

// ─────────────────────────────────────────────────────────────────────────────

describe('useSessionLoader', () => {
  beforeEach(() => {
    mockCurrentUser.value = null
    globalSessions.value = []
    globalIsLoading.value = false
    globalError.value = null
    globalLastUserId.value = null
    vi.clearAllMocks()
  })

  // ───────────────────────────────────────────────────
  describe('isSessionFileCandidate', () => {
    it('restituisce true per un file sessione valido', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      const valid = {
        session_info: {
          date_start: '2024-01-01T10:00:00',
          track: 'Monza',
        },
      }
      expect(isSessionFileCandidate('session_20240101_Monza.json', valid)).toBe(true)
    })

    it('restituisce false se il fileName non termina in .json', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      const obj = { session_info: { date_start: '2024-01-01', track: 'Spa' } }
      expect(isSessionFileCandidate('session.txt', obj)).toBe(false)
      expect(isSessionFileCandidate('session.csv', obj)).toBe(false)
    })

    it('restituisce false per live_state.json', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      const obj = { session_info: { date_start: '2024-01-01', track: 'Spa' } }
      expect(isSessionFileCandidate('live_state.json', obj)).toBe(false)
    })

    it('restituisce false se manca date_start nel session_info', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      const obj = { session_info: { track: 'Monza' } }
      expect(isSessionFileCandidate('session.json', obj)).toBe(false)
    })

    it('restituisce false se manca track nel session_info', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      const obj = { session_info: { date_start: '2024-01-01T10:00:00' } }
      expect(isSessionFileCandidate('session.json', obj)).toBe(false)
    })

    it('restituisce false se rawObj è null o undefined', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      expect(isSessionFileCandidate('session.json', null)).toBe(false)
      expect(isSessionFileCandidate('session.json', undefined)).toBe(false)
    })

    it('restituisce false se rawObj non ha session_info', () => {
      const { isSessionFileCandidate } = useSessionLoader()
      expect(isSessionFileCandidate('session.json', {})).toBe(false)
    })
  })

  // ───────────────────────────────────────────────────
  describe('loadSessions', () => {
    it('ritorna [] e logga warning se non c\'è userId né currentUser', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { loadSessions } = useSessionLoader()

      const result = await loadSessions()

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No user ID'))
    })

    it('utilizza la cache in-memory se i dati sono già caricati per lo stesso userId', async () => {
      const { loadCloudSessionsBounded } = await import('~/repositories/telemetryCloudRepository')
      vi.mocked(loadCloudSessionsBounded).mockResolvedValue([])

      mockCurrentUser.value = { uid: 'user-123' }
      globalSessions.value = [{ sessionId: 'cached-session' } as any]
      globalLastUserId.value = 'user-123'

      const { loadSessions } = useSessionLoader()
      const result = await loadSessions('user-123', false)

      // Cache hit: nessuna chiamata Firebase
      expect(loadCloudSessionsBounded).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('cached-session')
    })

    it('ignora la cache se forceReload=true', async () => {
      const { loadCloudSessionsBounded } = await import('~/repositories/telemetryCloudRepository')
      vi.mocked(loadCloudSessionsBounded).mockResolvedValue([
        { sessionId: 'fresh-session' } as any,
      ])

      mockCurrentUser.value = { uid: 'user-123' }
      globalSessions.value = [{ sessionId: 'cached-session' } as any]
      globalLastUserId.value = 'user-123'

      const { loadSessions } = useSessionLoader()
      const result = await loadSessions('user-123', true)

      expect(loadCloudSessionsBounded).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('fresh-session')
    })

    it('imposta isLoading=false e error sul messaggio in caso di eccezione', async () => {
      const { loadCloudSessionsBounded } = await import('~/repositories/telemetryCloudRepository')
      vi.mocked(loadCloudSessionsBounded).mockRejectedValue(new Error('Firebase unavailable'))

      mockCurrentUser.value = { uid: 'user-err' }

      const { loadSessions } = useSessionLoader()
      const result = await loadSessions('user-err', true)

      expect(result).toEqual([])
      expect(globalIsLoading.value).toBe(false)
      expect(globalError.value).toContain('Firebase unavailable')
    })
  })

  // ───────────────────────────────────────────────────
  describe('global state', () => {
    it('isLoading torna false dopo loadSessions (percorso normale)', async () => {
      const { loadCloudSessionsBounded } = await import('~/repositories/telemetryCloudRepository')
      vi.mocked(loadCloudSessionsBounded).mockResolvedValue([])
      mockCurrentUser.value = { uid: 'user-ok' }

      const { loadSessions } = useSessionLoader()
      await loadSessions('user-ok', true)

      expect(globalIsLoading.value).toBe(false)
    })
  })
})
