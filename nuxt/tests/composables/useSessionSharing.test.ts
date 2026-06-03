import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// ─── Firebase / config mocks ────────────────────────────────────────────────
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDocs: vi.fn(async () => ({ docs: [] })),
  trackedGetCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  trackedUpdateDoc: vi.fn(async () => {}),
  trackedWriteBatch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
}))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: any[]) => args[0]),
  where: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
}))

// ─── Auth mock ───────────────────────────────────────────────────────────────
const mockCurrentUser = ref<{ uid: string } | null>(null)
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ currentUser: mockCurrentUser }),
}))

// ─── Import dopo i mock ───────────────────────────────────────────────────────
import { useSessionSharing } from '~/composables/useSessionSharing'

// ─────────────────────────────────────────────────────────────────────────────

describe('useSessionSharing', () => {
  beforeEach(() => {
    mockCurrentUser.value = null
    vi.clearAllMocks()
  })

  // ───────────────────────────────────────────────────
  describe('countSharedSessions', () => {
    it('ritorna 0 se l\'utente non è autenticato', async () => {
      const { countSharedSessions } = useSessionSharing()
      const count = await countSharedSessions()
      expect(count).toBe(0)
    })

    it('chiama getCountFromServer e ritorna il conteggio quando autenticato', async () => {
      const { trackedGetCountFromServer } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetCountFromServer).mockResolvedValue({
        data: () => ({ count: 5 }),
      } as any)

      mockCurrentUser.value = { uid: 'user-123' }
      const { countSharedSessions } = useSessionSharing()
      const count = await countSharedSessions()

      expect(trackedGetCountFromServer).toHaveBeenCalled()
      expect(count).toBe(5)
    })

    it('ritorna 0 se il server risponde con count mancante', async () => {
      const { trackedGetCountFromServer } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetCountFromServer).mockResolvedValue({
        data: () => ({}),
      } as any)

      mockCurrentUser.value = { uid: 'user-456' }
      const { countSharedSessions } = useSessionSharing()
      const count = await countSharedSessions()

      expect(count).toBe(0)
    })
  })

  // ───────────────────────────────────────────────────
  describe('setSessionPublic', () => {
    it('lancia errore se l\'utente non è autenticato', async () => {
      const { setSessionPublic } = useSessionSharing()
      await expect(setSessionPublic('session-abc', true)).rejects.toThrow('Not authenticated')
    })

    it('chiama trackedUpdateDoc e non lancia se autenticato', async () => {
      const { trackedUpdateDoc, trackedGetDocs } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetDocs).mockResolvedValue({ docs: [] } as any)
      vi.mocked(trackedUpdateDoc).mockResolvedValue(undefined)

      mockCurrentUser.value = { uid: 'user-789' }
      const { setSessionPublic } = useSessionSharing()

      await expect(setSessionPublic('session-abc', false)).resolves.toBeUndefined()
      expect(trackedUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { isPublic: false },
        expect.any(String)
      )
    })
  })

  // ───────────────────────────────────────────────────
  describe('generateShareLink', () => {
    it('lancia errore se l\'utente non è autenticato', async () => {
      const { generateShareLink } = useSessionSharing()
      await expect(generateShareLink('session-xyz')).rejects.toThrow('Not authenticated')
    })

    it('ritorna un URL contenente sessionId e userId', async () => {
      const { trackedUpdateDoc, trackedGetDocs } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetDocs).mockResolvedValue({ docs: [] } as any)
      vi.mocked(trackedUpdateDoc).mockResolvedValue(undefined)

      mockCurrentUser.value = { uid: 'owner-001' }
      const { generateShareLink } = useSessionSharing()
      const link = await generateShareLink('session-xyz')

      expect(link).toContain('session-xyz')
      expect(link).toContain('owner-001')
    })
  })

  // ───────────────────────────────────────────────────
  describe('revokeAllSharedSessions', () => {
    it('lancia errore se l\'utente non è autenticato', async () => {
      const { revokeAllSharedSessions } = useSessionSharing()
      await expect(revokeAllSharedSessions()).rejects.toThrow('Not authenticated')
    })

    it('ritorna 0 se non ci sono sessioni condivise', async () => {
      const { trackedGetDocs } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetDocs).mockResolvedValue({ docs: [] } as any)

      mockCurrentUser.value = { uid: 'user-revoke' }
      const { revokeAllSharedSessions } = useSessionSharing()
      const count = await revokeAllSharedSessions()

      expect(count).toBe(0)
    })
  })
})
