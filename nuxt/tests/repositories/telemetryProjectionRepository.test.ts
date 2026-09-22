// PIP-441: /piste e Panoramica leggono l'indice piste (1 lettura) e ne servono ogni pista.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  collection: (_db: unknown, path: string) => path,
  query: (value: unknown) => value
}))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: fake.getDoc, trackedGetDocs: fake.getDocs }))

import { OWNER_DATA_CACHE_TTL_MS } from '~/services/cache/cachePolicy'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { TRACK_BESTS_SCHEMA_VERSION } from '~/services/sync/trackBestsProjectionService'
import { buildTrackBestsIndexDocument } from '~/services/sync/trackBestsIndexProjectionService'
import {
  clearTelemetryProjectionRepositoryCache,
  loadTrackBest,
  loadTrackBestsMap
} from '~/repositories/telemetryProjectionRepository'

type Store = Map<string, any>
let store: Store

function trackDoc(trackId: string, overrides: Record<string, unknown> = {}) {
  return {
    version: TRACK_BESTS_SCHEMA_VERSION, bestRulesVersion: BEST_RULES_VERSION, trackId,
    bests: { GT3: { Optimum: { bestQualy: 100_000 } } },
    activity: { totalLaps: 10, validLaps: 8, totalTimeMs: 1_000_000, sessionCount: 2 },
    syncedSessionIds: ['s1', 's2'], lastSessionDate: '2026-09-01T10:00:00.000Z', ...overrides
  }
}

function snapshotFor(path: string) {
  const data = store.get(path)
  return { exists: () => data !== undefined, data: () => data }
}

function collectionDocs(prefix: string) {
  return [...store.entries()].filter(([path]) => path.startsWith(prefix)).map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T10:00:00Z'))
  store = new Map()
  fake.getDoc.mockReset().mockImplementation(async (path: string) => snapshotFor(path))
  fake.getDocs.mockReset().mockImplementation(async (path: string) => ({ docs: collectionDocs(`${path}/`) }))
  clearTelemetryProjectionRepositoryCache()
})
afterEach(() => vi.useRealTimers())

describe('telemetryProjectionRepository con indice piste', () => {
  it('/piste: la mappa delle piste costa una sola lettura (l\'indice), nessuna query', async () => {
    store.set('users/u/trackBestsIndex/v1', buildTrackBestsIndexDocument({ monza: trackDoc('monza'), spa: trackDoc('spa') }))
    const map = await loadTrackBestsMap('u')
    expect(Object.keys(map).sort()).toEqual(['monza', 'spa'])
    expect(map.monza.activity.sessionCount).toBe(2)
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDoc).toHaveBeenCalledWith('users/u/trackBestsIndex/v1', 'TelemetryProjectionRepository')
    expect(fake.getDocs).not.toHaveBeenCalled()
  })

  it('Panoramica: due piste in parallelo costano una sola lettura e poi zero', async () => {
    store.set('users/u/trackBestsIndex/v1', buildTrackBestsIndexDocument({ monza: trackDoc('monza'), spa: trackDoc('spa') }))
    const [monza, spa, missing] = await Promise.all([loadTrackBest('u', 'monza'), loadTrackBest('u', 'spa'), loadTrackBest('u', 'zandvoort')])
    expect(monza.trackId).toBe('monza')
    expect(spa.trackId).toBe('spa')
    expect(missing).toBeNull()
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    await loadTrackBestsMap('u')
    await loadTrackBest('u', 'monza')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
  })

  it('indice assente: la mappa torna alla query della collection e la pista singola al documento', async () => {
    store.set('users/u/trackBests/monza', trackDoc('monza'))
    const map = await loadTrackBestsMap('u')
    expect(Object.keys(map)).toEqual(['monza'])
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    clearTelemetryProjectionRepositoryCache('u')
    const single = await loadTrackBest('u', 'monza')
    expect(single.trackId).toBe('monza')
    expect(fake.getDoc).toHaveBeenCalledTimes(3)
    expect(fake.getDoc).toHaveBeenLastCalledWith('users/u/trackBests/monza', 'TelemetryProjectionRepository')
    // Il "manca" e' ricordato: la seconda pista non rilegge l'indice.
    await loadTrackBest('u', 'spa')
    expect(fake.getDoc).toHaveBeenCalledTimes(4)
  })

  it('indice con versione vecchia o parziale (senza complete) viene ignorato', async () => {
    store.set('users/u/trackBestsIndex/v1', { ...buildTrackBestsIndexDocument({ monza: trackDoc('monza') }), version: 0 })
    store.set('users/u/trackBests/spa', trackDoc('spa'))
    expect(Object.keys(await loadTrackBestsMap('u'))).toEqual(['spa'])
    clearTelemetryProjectionRepositoryCache()
    store.set('users/u/trackBestsIndex/v1', { version: 1, updatedAt: 'x', tracks: { monza: trackDoc('monza') } })
    expect(Object.keys(await loadTrackBestsMap('u'))).toEqual(['spa'])
    expect(fake.getDocs).toHaveBeenCalledTimes(2)
  })

  it('indice non leggibile (rules non pubblicate, offline): fallback alla collection senza errore', async () => {
    store.set('users/u/trackBests/monza', trackDoc('monza'))
    fake.getDoc.mockImplementation(async (path: string) => {
      if (path.includes('/trackBestsIndex/')) throw new Error('permission-denied')
      return snapshotFor(path)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(Object.keys(await loadTrackBestsMap('u'))).toEqual(['monza'])
    expect((await loadTrackBest('u', 'monza')).trackId).toBe('monza')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('le voci con schema o regole legacy vengono scartate anche dall\'indice', async () => {
    store.set('users/u/trackBestsIndex/v1', buildTrackBestsIndexDocument({
      monza: trackDoc('monza'), legacy: trackDoc('legacy', { bestRulesVersion: 1 })
    }))
    expect(Object.keys(await loadTrackBestsMap('u'))).toEqual(['monza'])
    expect(await loadTrackBest('u', 'legacy')).toBeNull()
  })

  it('l\'indice segue il TTL owner e l\'invalidazione della sync', async () => {
    store.set('users/u/trackBestsIndex/v1', buildTrackBestsIndexDocument({ monza: trackDoc('monza') }))
    await loadTrackBestsMap('u')
    vi.advanceTimersByTime(OWNER_DATA_CACHE_TTL_MS - 1)
    await loadTrackBestsMap('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    clearTelemetryProjectionRepositoryCache('u')
    await loadTrackBestsMap('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(OWNER_DATA_CACHE_TTL_MS + 1)
    await loadTrackBest('u', 'monza')
    expect(fake.getDoc).toHaveBeenCalledTimes(3)
  })

  it('una lettura dell\'indice iniziata prima di un\'invalidazione non ripopola la cache', async () => {
    store.set('users/u/trackBestsIndex/v1', buildTrackBestsIndexDocument({ monza: trackDoc('monza') }))
    let release!: () => void
    fake.getDoc.mockImplementationOnce((path: string) => new Promise((resolve) => { release = () => resolve(snapshotFor(path)) }))
    const pending = loadTrackBestsMap('u')
    clearTelemetryProjectionRepositoryCache('u')
    release()
    await pending
    await loadTrackBestsMap('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })
})
