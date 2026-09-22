// PIP-444: il registro locale conosce lo stato cloud della sessione -> nessuna rilettura di
// sessions/{id} ne' query dei raw chunk prima del batch; `uploads/{hash}` non si scrive piu'.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ docs: new Map<string, any>(), deletes: [] as string[], commits: 0 }))
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
      delete: (ref: any) => pending.push(() => { state.deletes.push(ref.path); state.docs.delete(ref.path) }),
      commit: async () => { state.commits++; pending.forEach((apply) => apply()) }
    }
  }
}))

import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { createSessionUploadService, type RegistryCacheEntry } from '~/services/sync/sessionUploadService'

const UID = 'qa-owner'
const FILE = 'qa-session.json'

function raw(laps: number) {
  return {
    ownerId: UID,
    session_info: { track: 'spa', date_start: '2026-09-08T00:00:00Z', car_model: 'amr_v8_vantage_gt3', session_type: 2, laps_total: laps, laps_valid: laps, session_best_lap: 137000, avg_clean_lap: 138000, total_drive_time_ms: 140000 * laps },
    stints: [{ laps: Array.from({ length: laps }, (_, index) => ({ lap_time_ms: 137000 + index * 1000, is_valid: true })) }],
    summary: { best_rules_version: BEST_RULES_VERSION, laps, lapsValid: laps, bestLap: 137000, avgCleanLap: 138000, totalTime: 140000 * laps, stintCount: 1, provenance: { source: 'qa-isolated' } }
  }
}

function makeService(registry: Record<string, RegistryCacheEntry>, io: { getExistingSession: ReturnType<typeof vi.fn>; listExistingChunks: ReturnType<typeof vi.fn> }, canSkip = false) {
  return createSessionUploadService({
    db: {}, chunkSize: 80,
    getExistingSession: io.getExistingSession as any,
    loadRegistryCache: async () => registry,
    canSkipViaRegistry: () => canSkip,
    listExistingChunks: io.listExistingChunks as any
  })
}

function registryEntry(cloud: RegistryCacheEntry['cloud'], overrides: Partial<RegistryCacheEntry> = {}): RegistryCacheEntry {
  return {
    fileHash: cloud!.fileHash, rawDataHash: cloud!.rawDataHash, summaryHash: 'sum', mtime: 1, size: 1,
    uploadedBy: UID, sessionId: cloud!.sessionId, uploadedAt: '2026-09-08T01:00:00Z', bestRulesVersion: BEST_RULES_VERSION,
    cloud, ...overrides
  }
}

beforeEach(() => {
  state.docs.clear()
  state.deletes.length = 0
  state.commits = 0
  vi.stubGlobal('crypto', { subtle: { digest: async (_algo: string, data: Uint8Array) => {
    // Hash deterministico e diverso per contenuti diversi (fixture, non crittografia).
    const out = new Uint8Array(32)
    for (let index = 0; index < data.length; index++) out[index % 32] = (out[index % 32]! + data[index]!) & 0xff
    return out.buffer
  } } })
})

describe('PIP-444 registro con stato cloud', () => {
  it('primo caricamento (registro vuoto): legge sessions/{id} come prima, non scrive uploads/{hash}, restituisce lo stato cloud', async () => {
    const io = { getExistingSession: vi.fn(async () => null), listExistingChunks: vi.fn(async () => []) }
    const result = await makeService({}, io).uploadOrUpdateSession(raw(2), JSON.stringify(raw(2)), FILE, UID, { precomputedHash: 'hash-1' })
    expect(result.status).toBe('created')
    expect(io.getExistingSession).toHaveBeenCalledTimes(1)
    expect(io.listExistingChunks).not.toHaveBeenCalled()
    expect([...state.docs.keys()].some((path) => path.includes('/uploads/'))).toBe(false)
    const chunkCount = [...state.docs.keys()].filter((path) => path.includes('/rawChunks/')).length
    expect(chunkCount).toBeGreaterThan(1)
    expect(result.cloudState).toEqual({
      sessionId: result.sessionId, fileHash: 'hash-1', rawDataHash: expect.any(String),
      summaryRulesVersion: BEST_RULES_VERSION, sessionVersion: 1, rawChunkCount: chunkCount,
      rawSizeBytes: JSON.stringify(raw(2)).length, rawEncoding: 'json-string'
    })
  })

  it('file noto al registro e cambiato (giro successivo): zero letture, chunk sostituiti e code tagliate dallo stato noto', async () => {
    const first = { getExistingSession: vi.fn(async () => null), listExistingChunks: vi.fn(async () => []) }
    const created = await makeService({}, first).uploadOrUpdateSession(raw(6), JSON.stringify(raw(6)), FILE, UID, { precomputedHash: 'hash-6' })
    const registry = { [FILE]: registryEntry(created.cloudState) }
    const io = { getExistingSession: vi.fn(async () => { throw new Error('must not read') }), listExistingChunks: vi.fn(async () => { throw new Error('must not query') }) }

    const updated = await makeService(registry, io).uploadOrUpdateSession(raw(2), JSON.stringify(raw(2)), FILE, UID, { precomputedHash: 'hash-2' })
    expect(updated.status).toBe('updated')
    expect(io.getExistingSession).not.toHaveBeenCalled()
    expect(io.listExistingChunks).not.toHaveBeenCalled()
    const session = state.docs.get(`users/${UID}/sessions/${created.sessionId}`)
    expect(session.version).toBe(2)
    expect(session.rawChunkCount).toBe(updated.cloudState!.rawChunkCount)
    // La coda oltre il nuovo numero di chunk viene eliminata nello stesso batch.
    expect(state.deletes.length).toBe(created.cloudState!.rawChunkCount - updated.cloudState!.rawChunkCount)
    expect([...state.docs.keys()].filter((path) => path.includes('/rawChunks/'))).toHaveLength(updated.cloudState!.rawChunkCount)
    expect(updated.cloudState!.sessionVersion).toBe(2)
  })

  it('registro noto e file identico (mtime cambiato): unchanged senza alcuna lettura, stato cloud conservato', async () => {
    const first = { getExistingSession: vi.fn(async () => null), listExistingChunks: vi.fn(async () => []) }
    const created = await makeService({}, first).uploadOrUpdateSession(raw(2), JSON.stringify(raw(2)), FILE, UID, { precomputedHash: 'hash-2' })
    const io = { getExistingSession: vi.fn(), listExistingChunks: vi.fn() }
    const result = await makeService({ [FILE]: registryEntry(created.cloudState) }, io, true)
      .uploadOrUpdateSession(raw(2), JSON.stringify(raw(2)), FILE, UID, { precomputedHash: 'hash-2' })
    expect(result).toMatchObject({ status: 'unchanged', reason: 'registry_cache_hit', cloudState: created.cloudState })
    expect(io.getExistingSession).not.toHaveBeenCalled()
    expect(state.commits).toBe(1)
  })

  it('registro incoerente (altro owner, altra sessione, hash diverso, blocco malformato): letture come prima', async () => {
    const first = { getExistingSession: vi.fn(async () => null), listExistingChunks: vi.fn(async () => []) }
    const created = await makeService({}, first).uploadOrUpdateSession(raw(6), JSON.stringify(raw(6)), FILE, UID, { precomputedHash: 'hash-6' })
    const existing = state.docs.get(`users/${UID}/sessions/${created.sessionId}`)
    const variants: RegistryCacheEntry[] = [
      registryEntry(created.cloudState, { uploadedBy: 'someone-else' }),
      registryEntry(created.cloudState, { sessionId: 'other-session' }),
      { ...registryEntry(created.cloudState), cloud: { ...created.cloudState!, fileHash: 'not-the-uploaded-one' } },
      registryEntry({ ...created.cloudState!, rawChunkCount: -1 }),
      { ...registryEntry(created.cloudState), cloud: undefined }
    ]
    for (const entry of variants) {
      const io = {
        getExistingSession: vi.fn(async () => existing),
        listExistingChunks: vi.fn(async () => [...state.docs.keys()].filter((path) => path.includes('/rawChunks/')).map((path) => ({ id: path.split('/').pop()!, ref: { path } })))
      }
      const result = await makeService({ [FILE]: entry }, io).uploadOrUpdateSession(raw(2), JSON.stringify(raw(2)), FILE, UID, { precomputedHash: 'hash-2' })
      expect(result.status).toBe('updated')
      expect(io.getExistingSession).toHaveBeenCalledTimes(1)
      expect(io.listExistingChunks).toHaveBeenCalledTimes(1)
    }
  })
})
