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

    it('PIP-591: sessione e chunk cambiano nello stesso batch, quindi insieme o per niente', async () => {
      const { trackedGetDocs, trackedWriteBatch, trackedUpdateDoc } = await import('~/composables/useFirebaseTracker')
      const chunkRefs = [{ id: 'c1' }, { id: 'c2' }]
      vi.mocked(trackedGetDocs).mockResolvedValue({ docs: chunkRefs.map(ref => ({ ref })) } as any)
      const batch = { update: vi.fn(), commit: vi.fn(async () => {}) }
      vi.mocked(trackedWriteBatch).mockReturnValue(batch as any)

      mockCurrentUser.value = { uid: 'user-789' }
      const { setSessionPublic } = useSessionSharing()
      await expect(setSessionPublic('session-abc', false)).resolves.toBeUndefined()

      expect(trackedWriteBatch).toHaveBeenCalledTimes(1)
      expect(batch.update).toHaveBeenCalledTimes(3) // sessione + 2 chunk
      expect(batch.update).toHaveBeenCalledWith(chunkRefs[0], { isPublic: false })
      expect(batch.commit).toHaveBeenCalledTimes(1)
      expect(trackedUpdateDoc).not.toHaveBeenCalled()
    })

    it('PIP-591: oltre il limite del batch, in revoca i chunk diventano privati prima della sessione', async () => {
      const { trackedGetDocs, trackedWriteBatch, trackedUpdateDoc } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetDocs).mockResolvedValue({ docs: Array.from({ length: 460 }, (_, i) => ({ ref: { id: `c${i}` } })) } as any)
      const order: string[] = []
      vi.mocked(trackedWriteBatch).mockImplementation(() => ({ update: vi.fn(), commit: vi.fn(async () => { order.push('chunks') }) }) as any)
      vi.mocked(trackedUpdateDoc).mockImplementation(async () => { order.push('session') })

      mockCurrentUser.value = { uid: 'user-789' }
      const { setSessionPublic } = useSessionSharing()
      await setSessionPublic('big', false)
      expect(order).toEqual(['chunks', 'chunks', 'session'])

      order.length = 0
      await setSessionPublic('big', true)
      expect(order).toEqual(['session', 'chunks', 'chunks'])
    })

    it('PIP-591: se i chunk falliscono durante la revoca, la sessione resta pubblica e "Revoca tutto" la ritrova', async () => {
      const { trackedGetDocs, trackedWriteBatch, trackedUpdateDoc } = await import('~/composables/useFirebaseTracker')
      vi.mocked(trackedGetDocs).mockResolvedValue({ docs: Array.from({ length: 460 }, (_, i) => ({ ref: { id: `c${i}` } })) } as any)
      vi.mocked(trackedWriteBatch).mockImplementation(() => ({ update: vi.fn(), commit: vi.fn(async () => { throw new Error('offline') }) }) as any)

      mockCurrentUser.value = { uid: 'user-789' }
      const { setSessionPublic } = useSessionSharing()
      await expect(setSessionPublic('big', false)).rejects.toThrow('offline')
      expect(trackedUpdateDoc).not.toHaveBeenCalled()
      // clearAllMocks non ripristina le implementazioni: torna al batch che riesce per i test successivi.
      vi.mocked(trackedWriteBatch).mockImplementation(() => ({ update: vi.fn(), commit: vi.fn(async () => {}) }) as any)
      vi.mocked(trackedUpdateDoc).mockImplementation(async () => {})
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
