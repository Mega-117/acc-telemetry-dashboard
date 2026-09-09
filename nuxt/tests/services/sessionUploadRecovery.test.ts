import { expect, it, vi } from 'vitest'

// Synthetic persistence boundary: no Firebase connection or user data.
const state = vi.hoisted(() => ({ docs: new Map<string, any>(), offline: true, commits: 0 }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (parent: any, path: string) => ({ path: parent?.path ? `${parent.path}/${path}` : path }),
  serverTimestamp: () => ({ serverTimestamp: true })
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedWriteBatch: () => {
    const pending: Array<() => void> = []
    return {
      set: (ref: any, value: any) => pending.push(() => state.docs.set(ref.path, value)),
      delete: (ref: any) => pending.push(() => state.docs.delete(ref.path)),
      commit: async () => {
        state.commits++
        if (state.offline) throw new Error('qa-offline')
        pending.forEach(apply => apply())
      }
    }
  }
}))
import { createSessionUploadService } from '~/services/sync/sessionUploadService'

it('retries a failed session batch without data loss or duplicate upload', async () => {
  vi.stubGlobal('crypto', { subtle: { digest: async () => new Uint8Array(32).buffer } })
  try {
    const raw = {
      ownerId: 'qa-owner',
      session_info: { track: 'spa', date_start: '2026-09-08T00:00:00Z', car_model: 'amr_v8_vantage_gt3', session_type: 2, laps_total: 2, laps_valid: 2, session_best_lap: 137000, avg_clean_lap: 138000, total_drive_time_ms: 280000 },
      stints: [{ laps: [{ lap_time_ms: 137000, is_valid: true }, { lap_time_ms: 139000, is_valid: true }] }],
      summary: { best_rules_version: 5, laps: 2, lapsValid: 2, bestLap: 137000, avgCleanLap: 138000, totalTime: 280000, stintCount: 1, provenance: { source: 'qa-isolated' } }
    }
    const original = JSON.stringify(raw)
    const service = createSessionUploadService({
      db: {}, chunkSize: 80,
      getExistingSession: async (_uid, id) => state.docs.get(`users/qa-owner/sessions/${id}`) || null,
      loadRegistryCache: async () => ({}), canSkipViaRegistry: () => false,
      listExistingChunks: async () => []
    })
    const send = () => service.uploadOrUpdateSession(raw, original, 'qa-session.json', 'qa-owner', { precomputedHash: 'qa-hash' })
    expect(await send()).toMatchObject({ status: 'error' })
    expect(state.docs.size).toBe(0)
    expect(JSON.stringify(raw)).toBe(original)
    state.offline = false
    const recovered = await send()
    expect(recovered.status).toBe('created')
    const snapshot = JSON.stringify([...state.docs])
    expect(await send()).toMatchObject({ status: 'unchanged' })
    expect(JSON.stringify([...state.docs])).toBe(snapshot)
    expect(state.commits).toBe(2)
    const chunks = [...state.docs].filter(([key]) => key.includes('/rawChunks/'))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map(([, value]) => value).sort((a, b) => a.idx - b.idx).map(value => value.chunk).join('')).toBe(original)
  } finally {
    vi.unstubAllGlobals()
  }
})
