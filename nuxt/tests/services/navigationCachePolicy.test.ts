// PIP-438: i dati dell'owner restano in cache finche' non cambiano (sync, profilo, refresh);
// il TTL e' solo una rete di sicurezza. I dati di altri utenti restano brevi.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, path: string) => path, collection: (_db: unknown, path: string) => path, query: (value: unknown) => value }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: fake.getDoc, trackedGetDocs: fake.getDocs }))

import { OWNER_DATA_CACHE_TTL_MS, SHARED_DATA_CACHE_TTL_MS } from '~/services/cache/cachePolicy'
import { clearTelemetryProjectionRepositoryCache, loadTrackBestsMap, loadUserProjection } from '~/repositories/telemetryProjectionRepository'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T10:00:00Z'))
  // PIP-441: `loadTrackBestsMap` legge prima l'indice piste (`trackBestsIndex/v1`); qui
  // l'indice manca, quindi il repository torna alla collection come prima.
  fake.getDoc.mockReset().mockImplementation(async (path: string) => path.includes('/trackBestsIndex/')
    ? { exists: () => false, data: () => null }
    : { exists: () => true, data: () => ({ stats: {}, sessionIndex: {} }) })
  fake.getDocs.mockReset().mockResolvedValue({ docs: [] })
  clearTelemetryProjectionRepositoryCache()
})
afterEach(() => vi.useRealTimers())

describe('cache di navigazione', () => {
  it('does not repopulate the cache with a read started before invalidation', async () => {
    let resolve!: (snapshot: any) => void
    fake.getDoc.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const pending = loadUserProjection('u')
    clearTelemetryProjectionRepositoryCache('u')
    resolve({ exists: () => true, data: () => ({ stats: { totalSessions: 1 } }) })
    await pending
    await loadUserProjection('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })
  it('i dati owner durano 15 minuti, quelli condivisi 60 secondi', () => {
    expect(OWNER_DATA_CACHE_TTL_MS).toBe(15 * 60_000)
    expect(SHARED_DATA_CACHE_TTL_MS).toBe(60_000)
  })

  it('tornare su una pagina dopo 10 minuti non rilegge Firebase', async () => {
    await loadUserProjection('u')
    await loadTrackBestsMap('u')
    vi.advanceTimersByTime(10 * 60_000)
    await loadUserProjection('u')
    await loadTrackBestsMap('u')
    // users/* + tentativo indice piste (assente), poi la collection: tutto una volta sola.
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
  })

  it('una sync (invalidazione) fa rileggere subito; oltre il TTL si rilegge comunque', async () => {
    await loadUserProjection('u')
    clearTelemetryProjectionRepositoryCache('u')
    await loadUserProjection('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(OWNER_DATA_CACHE_TTL_MS + 1)
    await loadUserProjection('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(3)
  })
})
