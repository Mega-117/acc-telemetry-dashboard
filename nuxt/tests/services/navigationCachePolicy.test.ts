// PIP-438/PIP-442: i dati dell'owner restano in cache finche' non cambiano (sync, profilo,
// refresh, revisione da un altro PC); nessuna scadenza a tempo entro l'avvio. I dati di
// altri utenti restano brevi; il calendario (scrivibile dal coach) conserva 15 minuti.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, path: string) => path, collection: (_db: unknown, path: string) => path, query: (value: unknown) => value }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: fake.getDoc, trackedGetDocs: fake.getDocs }))

import {
  FOREIGN_OWNER_DATA_CACHE_TTL_MS,
  OWNER_DATA_CACHE_TTL_MS,
  OWNER_REVISION_CHECK_MS,
  RACE_CALENDAR_CACHE_TTL_MS,
  SHARED_DATA_CACHE_TTL_MS,
  ownerDataCacheTtlFor,
  setCacheOwnerUid
} from '~/services/cache/cachePolicy'
import { clearOwnerDocumentCache } from '~/repositories/ownerDocumentRepository'
import { clearTelemetryProjectionRepositoryCache, loadTrackBestsMap, loadUserProjection } from '~/repositories/telemetryProjectionRepository'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T10:00:00Z'))
  // L'account corrente e' 'u': le sue cache non scadono a tempo.
  setCacheOwnerUid('u')
  // PIP-441: `loadTrackBestsMap` legge prima l'indice piste (`trackBestsIndex/v1`); qui
  // l'indice manca, quindi il repository torna alla collection come prima.
  fake.getDoc.mockReset().mockImplementation(async (path: string) => path.includes('/trackBestsIndex/')
    ? { exists: () => false, data: () => null }
    : { exists: () => true, data: () => ({ stats: {}, sessionIndex: {} }) })
  fake.getDocs.mockReset().mockResolvedValue({ docs: [] })
  clearOwnerDocumentCache()
  clearTelemetryProjectionRepositoryCache()
})
afterEach(() => {
  setCacheOwnerUid(null)
  vi.useRealTimers()
})

describe('cache di navigazione', () => {
  it('coach: i dati di un altro pilota scadono dopo 15 minuti, quelli propri mai', async () => {
    expect(FOREIGN_OWNER_DATA_CACHE_TTL_MS).toBe(15 * 60_000)
    expect(ownerDataCacheTtlFor('u')).toBe(Number.POSITIVE_INFINITY)
    expect(ownerDataCacheTtlFor('pilot')).toBe(FOREIGN_OWNER_DATA_CACHE_TTL_MS)
    expect(ownerDataCacheTtlFor(null)).toBe(FOREIGN_OWNER_DATA_CACHE_TTL_MS)
    await loadUserProjection('pilot')
    await loadTrackBestsMap('pilot')
    vi.advanceTimersByTime(FOREIGN_OWNER_DATA_CACHE_TTL_MS + 1)
    await loadUserProjection('pilot')
    await loadTrackBestsMap('pilot')
    expect(fake.getDoc).toHaveBeenCalledTimes(4)
    expect(fake.getDocs).toHaveBeenCalledTimes(2)
    setCacheOwnerUid(null)
    expect(ownerDataCacheTtlFor('u')).toBe(FOREIGN_OWNER_DATA_CACHE_TTL_MS)
  })

  it('does not repopulate the cache with a read started before invalidation', async () => {
    let resolve!: (snapshot: any) => void
    fake.getDoc.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const pending = loadUserProjection('u')
    clearOwnerDocumentCache('u')
    resolve({ exists: () => true, data: () => ({ stats: { totalSessions: 1 } }) })
    await pending
    await loadUserProjection('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })

  it('i dati owner non scadono a tempo; revisione ogni 15 minuti; condivisi 60 s; calendario 15 min', () => {
    expect(OWNER_DATA_CACHE_TTL_MS).toBe(Number.POSITIVE_INFINITY)
    expect(OWNER_REVISION_CHECK_MS).toBe(15 * 60_000)
    expect(RACE_CALENDAR_CACHE_TTL_MS).toBe(15 * 60_000)
    expect(SHARED_DATA_CACHE_TTL_MS).toBe(60_000)
  })

  it('tornare su una pagina dopo ore non rilegge Firebase', async () => {
    await loadUserProjection('u')
    await loadTrackBestsMap('u')
    vi.advanceTimersByTime(5 * 60 * 60_000)
    await loadUserProjection('u')
    await loadTrackBestsMap('u')
    // users/* + tentativo indice piste (assente), poi la collection: tutto una volta sola.
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
  })

  it('una sync (invalidazione) fa rileggere subito; senza invalidazione mai', async () => {
    await loadUserProjection('u')
    clearOwnerDocumentCache('u')
    clearTelemetryProjectionRepositoryCache('u')
    await loadUserProjection('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(24 * 60 * 60_000)
    await loadUserProjection('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })
})
