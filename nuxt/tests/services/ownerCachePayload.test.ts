// PIP-442: serializer/validator del file locale con le proiezioni owner (logica pura).
import { describe, expect, it } from 'vitest'
import {
  OWNER_CACHE_MAX_BYTES,
  OWNER_CACHE_SCHEMA_VERSION,
  buildOwnerCachePayload,
  hasOwnerCacheEntries,
  parseOwnerCachePayload,
  serializeOwnerCachePayload,
  shouldHydrateOwnerCache
} from '~/services/cache/ownerCachePayload'

const summary = { version: 1, updatedAt: '2026-09-22T10:00:00.000Z', events: [], truncated: false } as any
const entries = {
  trackBestsIndex: { document: { version: 1, tracks: { monza: {} } } },
  raceCalendarIndex: { summary, cachedAt: 1_000 },
  sessionList: { entries: [{ id: 's1', date: '2026-09-01' }] as any },
  // PIP-444: mirror della sync con la propria revisione.
  syncMirror: {
    schemaVersion: 1 as const, revision: 'r1', trackOrder: ['monza'], updatedAt: '2026-09-22T10:00:00.000Z',
    docs: { 'sessionListMeta/v1': { schemaVersion: 1 }, 'trackProjections/monza': { schemaVersion: 1, trackId: 'monza' }, 'trackBests/spa': null }
  }
}

describe('ownerCachePayload', () => {
  it('costruisce, serializza e rilegge lo stesso payload', () => {
    const payload = buildOwnerCachePayload({ uid: 'u', revision: 'r1', entries, now: new Date('2026-09-22T10:00:00Z') })
    expect(payload.schemaVersion).toBe(OWNER_CACHE_SCHEMA_VERSION)
    expect(payload.savedAt).toBe('2026-09-22T10:00:00.000Z')
    expect(hasOwnerCacheEntries(payload)).toBe(true)
    const json = serializeOwnerCachePayload(payload)
    expect(json).not.toBeNull()
    expect(parseOwnerCachePayload(json, 'u')).toEqual(payload)
    expect(parseOwnerCachePayload(JSON.parse(json!), 'u')).toEqual(payload)
  })

  it('ignora voci non in whitelist e salva solo quelle presenti', () => {
    const payload = buildOwnerCachePayload({ uid: 'u', revision: 'r1', entries: { trackBestsIndex: { document: 'no' as any } } })
    expect(hasOwnerCacheEntries(payload)).toBe(false)
  })

  it('fail-closed: uid diverso, schema diverso, revisione assente, voce sconosciuta, corrotto', () => {
    const payload = buildOwnerCachePayload({ uid: 'u', revision: 'r1', entries })
    expect(parseOwnerCachePayload(payload, 'other')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, schemaVersion: 2 }, 'u')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, revision: '' }, 'u')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, entries: { ...payload.entries, secrets: {} } }, 'u')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, entries: { sessionList: { entries: 'x' } } }, 'u')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, entries: { raceCalendarIndex: { summary, cachedAt: 'x' } } }, 'u')).toBeNull()
    // PIP-444: mirror senza revisione, con schema diverso o con percorsi fuori whitelist.
    expect(parseOwnerCachePayload({ ...payload, entries: { syncMirror: { ...entries.syncMirror, revision: '' } } }, 'u')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, entries: { syncMirror: { ...entries.syncMirror, schemaVersion: 2 } } }, 'u')).toBeNull()
    expect(parseOwnerCachePayload({ ...payload, entries: { syncMirror: { ...entries.syncMirror, docs: { 'users/u': {} } } } }, 'u')).toBeNull()
    expect(buildOwnerCachePayload({ uid: 'u', revision: 'r1', entries: { syncMirror: { bad: true } as any } }).entries.syncMirror).toBeUndefined()
    expect(parseOwnerCachePayload('{not json', 'u')).toBeNull()
    expect(parseOwnerCachePayload(null, 'u')).toBeNull()
    expect(parseOwnerCachePayload([], 'u')).toBeNull()
  })

  it('oltre il limite non si serializza e non si accetta', () => {
    const big = buildOwnerCachePayload({
      uid: 'u', revision: 'r1',
      // PIP-444: limite 4 MB (era 2): servono piu' voci per superarlo.
      entries: { sessionList: { entries: Array.from({ length: 40_000 }, (_, i) => ({ id: `s${i}`, track: 'x'.repeat(120) })) as any } }
    })
    expect(serializeOwnerCachePayload(big)).toBeNull()
    expect(serializeOwnerCachePayload(big, 100 * OWNER_CACHE_MAX_BYTES)).not.toBeNull()
    expect(parseOwnerCachePayload('x'.repeat(OWNER_CACHE_MAX_BYTES + 1), 'u')).toBeNull()
  })

  it('si idrata solo con la stessa revisione', () => {
    const payload = buildOwnerCachePayload({ uid: 'u', revision: 'r1', entries })
    expect(shouldHydrateOwnerCache(payload, 'r1')).toBe(true)
    expect(shouldHydrateOwnerCache(payload, 'r2')).toBe(false)
    expect(shouldHydrateOwnerCache(payload, null)).toBe(false)
    expect(shouldHydrateOwnerCache(null, 'r1')).toBe(false)
  })
})
