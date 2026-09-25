// PIP-441: builder puro dell'indice piste `users/{uid}/trackBestsIndex/v1`.
import { describe, expect, it } from 'vitest'
import {
  TRACK_BESTS_INDEX_MAX_BYTES,
  TRACK_BESTS_INDEX_SCHEMA_VERSION,
  applyTrackBestsIndexEntry,
  buildDisabledTrackBestsIndexDocument,
  buildTrackBestsIndexDocument,
  buildTrackBestsIndexEntry,
  buildTrackBestsIndexIncrementalWrite,
  exceedsTrackBestsIndexSizeGuard,
  expandTrackBestsIndexEntry,
  isTrackBestsIndexConsistent,
  isTrackBestsIndexDisabled,
  isTrackBestsIndexUsable,
  serializedTrackBestsIndexBytes,
  trackBestsIndexPath
} from '~/services/sync/trackBestsIndexProjectionService'

const CATEGORIES = ['GT3', 'GT4', 'CUP', 'GT2', 'ST', 'TCX']
const GRIPS = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
const BUCKETS = ['40-60', '60-80', '80-100', '100+']

function bucketRecord(timeMs: number) {
  return { timeMs, fuel: 55, airTemp: 24, roadTemp: 31, grip: 'Optimum', sessionId: 'session-1', date: '2026-09-01T10:00:00.000Z', sampleLapCount: 5, confidence: 'high', source: 'stint_avg' }
}

function gripBest(populated: boolean) {
  const nulls = Object.fromEntries(['bestQualy', 'bestQualyTemp', 'bestQualyFuel', 'bestQualySessionId', 'bestQualyDate',
    'bestRace', 'bestRaceTemp', 'bestRaceFuel', 'bestRaceSessionId', 'bestRaceDate',
    'bestAvgRace', 'bestAvgRaceTemp', 'bestAvgRaceFuel', 'bestAvgRaceSessionId', 'bestAvgRaceDate'].map((key) => [key, null]))
  const empty = Object.fromEntries(BUCKETS.map((bucket) => [bucket, {}]))
  if (!populated) return { ...nulls, raceBestByFuelBucket: empty, raceAvgByFuelBucket: empty }
  return {
    bestQualy: 100_000, bestQualyTemp: 24, bestQualyFuel: 10, bestQualySessionId: 'session-1', bestQualyDate: '2026-09-01T10:00:00.000Z',
    bestRace: 101_000, bestRaceTemp: 24, bestRaceFuel: 55, bestRaceSessionId: 'session-1', bestRaceDate: '2026-09-01T10:00:00.000Z',
    bestAvgRace: 102_000, bestAvgRaceTemp: 24, bestAvgRaceFuel: 55, bestAvgRaceSessionId: 'session-1', bestAvgRaceDate: '2026-09-01T10:00:00.000Z',
    raceBestByFuelBucket: Object.fromEntries(BUCKETS.map((bucket) => [bucket, bucketRecord(101_000)])),
    raceAvgByFuelBucket: Object.fromEntries(BUCKETS.map((bucket) => [bucket, bucketRecord(102_000)]))
  }
}

/** Documento per pista con la stessa shape scritta da trackBestsProjectionService (schema 4). */
function trackDoc(trackId: string, options: { sessionCount?: number; fullyPopulated?: boolean; lastSessionDate?: string } = {}) {
  const { sessionCount = 3, fullyPopulated = false, lastSessionDate = '2026-09-01T10:00:00.000Z' } = options
  const bests = Object.fromEntries(CATEGORIES.map((category) => [
    category,
    Object.fromEntries(GRIPS.map((grip) => [grip, gripBest(fullyPopulated || (category === 'GT3' && grip === 'Optimum'))]))
  ]))
  return {
    version: 4,
    bestRulesVersion: 5,
    trackId,
    bests,
    activity: { totalLaps: 30, validLaps: 25, totalTimeMs: 3_000_000, sessionCount, lastSessionDate },
    syncedSessionIds: Array.from({ length: sessionCount }, (_, index) => `session-${index}`),
    lastSessionDate,
    lastUpdated: { seconds: 1, nanoseconds: 0 }
  }
}

describe('trackBestsIndexProjectionService', () => {
  it('costruisce una voce per pista senza ledger ne timestamp, normalizzando l\'id', () => {
    const entry = buildTrackBestsIndexEntry('Monza', trackDoc('monza'))
    expect(entry).toMatchObject({ version: 4, bestRulesVersion: 5, trackId: 'monza', lastSessionDate: '2026-09-01T10:00:00.000Z' })
    expect(entry).not.toHaveProperty('syncedSessionIds')
    expect(entry).not.toHaveProperty('lastUpdated')
    expect(entry?.bests.GT3.Optimum.bestQualy).toBe(100_000)
    expect(entry?.activity.sessionCount).toBe(3)
    expect(buildTrackBestsIndexEntry('', null)).toBeNull()
  })

  it('l\'indice completo copre tutte le piste ed e\' marcato complete', () => {
    const indexDoc = buildTrackBestsIndexDocument([
      { id: 'monza', data: trackDoc('monza') },
      { id: 'spa', data: trackDoc('spa', { sessionCount: 1 }) }
    ], '2026-09-22T10:00:00.000Z')
    expect(indexDoc).toMatchObject({ version: TRACK_BESTS_INDEX_SCHEMA_VERSION, bestRulesVersion: 5, updatedAt: '2026-09-22T10:00:00.000Z', complete: true })
    expect(Object.keys(indexDoc.tracks).sort()).toEqual(['monza', 'spa'])
    expect(isTrackBestsIndexUsable(indexDoc)).toBe(true)
    expect(trackBestsIndexPath('u1')).toBe('users/u1/trackBestsIndex/v1')
  })

  it('applyTrackBestsIndexEntry sostituisce la voce senza mutare l\'indice originale', () => {
    const original = buildTrackBestsIndexDocument({ monza: trackDoc('monza') }, '2026-09-22T10:00:00.000Z')
    const updated = applyTrackBestsIndexEntry(original, 'monza', trackDoc('monza', { sessionCount: 4 }), '2026-09-22T11:00:00.000Z')
    expect(original.tracks.monza!.activity.sessionCount).toBe(3)
    expect(updated.tracks.monza!.activity.sessionCount).toBe(4)
    expect(updated.updatedAt).toBe('2026-09-22T11:00:00.000Z')
    expect(updated.complete).toBe(true)
    const added = applyTrackBestsIndexEntry(updated, 'spa', trackDoc('spa'))
    expect(Object.keys(added.tracks).sort()).toEqual(['monza', 'spa'])
    expect(applyTrackBestsIndexEntry(updated, '', null)).toBe(updated)
  })

  it('la scrittura incrementale contiene solo le piste cambiate, sostituite per intero, senza complete', () => {
    const write = buildTrackBestsIndexIncrementalWrite({ spa: trackDoc('spa') }, '2026-09-22T10:00:00.000Z')
    expect(write?.options).toEqual({ mergeFields: ['version', 'updatedAt', 'tracks.spa'] })
    expect(write?.data).toMatchObject({ version: TRACK_BESTS_INDEX_SCHEMA_VERSION, updatedAt: '2026-09-22T10:00:00.000Z' })
    expect(Object.keys(write!.data.tracks)).toEqual(['spa'])
    expect(write!.data).not.toHaveProperty('complete')
    expect(buildTrackBestsIndexIncrementalWrite({})).toBeNull()
  })

  it('un indice parziale (merge su documento mancante), vecchio o disabilitato non e\' usabile', () => {
    const partial = buildTrackBestsIndexIncrementalWrite({ spa: trackDoc('spa') })!.data
    expect(isTrackBestsIndexUsable(partial)).toBe(false)
    expect(isTrackBestsIndexUsable({ ...buildTrackBestsIndexDocument({}), version: 99 })).toBe(false)
    expect(isTrackBestsIndexUsable(null)).toBe(false)
    const disabled = buildDisabledTrackBestsIndexDocument('2026-09-22T10:00:00.000Z')
    expect(isTrackBestsIndexUsable(disabled)).toBe(false)
    expect(isTrackBestsIndexDisabled(disabled)).toBe(true)
    expect(isTrackBestsIndexDisabled(partial)).toBe(false)
  })

  it('la coerenza con la collection confronta piste e riassunti; un indice disabilitato e\' coerente', () => {
    const docs = [{ id: 'monza', data: trackDoc('monza') }, { id: 'spa', data: trackDoc('spa') }]
    const indexDoc = buildTrackBestsIndexDocument(docs)
    expect(isTrackBestsIndexConsistent(indexDoc, docs)).toBe(true)
    expect(isTrackBestsIndexConsistent(null, docs)).toBe(false)
    expect(isTrackBestsIndexConsistent(indexDoc, docs.slice(0, 1))).toBe(false)
    expect(isTrackBestsIndexConsistent(indexDoc, [docs[0]!, { id: 'spa', data: trackDoc('spa', { sessionCount: 9 }) }])).toBe(false)
    expect(isTrackBestsIndexConsistent(indexDoc, [docs[0]!, { id: 'spa', data: trackDoc('spa', { lastSessionDate: '2026-09-02T10:00:00.000Z' }) }])).toBe(false)
    expect(isTrackBestsIndexConsistent(buildDisabledTrackBestsIndexDocument(), docs)).toBe(true)
    expect(isTrackBestsIndexConsistent(buildTrackBestsIndexDocument([]), [])).toBe(true)
  })

  it('le voci sono compatte in scrittura e tornano alla forma completa in lettura', () => {
    const source = trackDoc('monza')
    // Grip con un solo dato: nella voce compatta resta solo quel campo.
    source.bests.GT3!.Fast = { ...gripBest(false), bestQualy: 99_000 }
    const entry = buildTrackBestsIndexEntry('monza', source)!
    expect(Object.keys(entry.bests)).toEqual(['GT3'])
    expect(Object.keys(entry.bests.GT3).sort()).toEqual(['Fast', 'Optimum'])
    expect(entry.bests.GT3.Fast).toEqual({ bestQualy: 99_000 })
    expect(entry.bests.GT3.Optimum.raceBestByFuelBucket['40-60']).toMatchObject({ timeMs: 101_000, sampleLapCount: 5 })
    expect(serializedTrackBestsIndexBytes(entry)).toBeLessThan(serializedTrackBestsIndexBytes(source) / 4)
    const expanded = expandTrackBestsIndexEntry(entry)
    expect(expanded.bests).toEqual(source.bests)
    expect(expanded.activity).toEqual(source.activity)
    expect(expandTrackBestsIndexEntry(null)).toBeNull()
  })

  it('la soglia di dimensione lascia ampio margine con tutte le piste ACC in uso reale', () => {
    // 30 piste (tutte quelle di ACC) con GT3 Optimum popolato: caso d'uso tipico.
    const docs = Array.from({ length: 30 }, (_, index) => ({ id: `track_${index}`, data: trackDoc(`track_${index}`) }))
    const indexDoc = buildTrackBestsIndexDocument(docs)
    const bytes = serializedTrackBestsIndexBytes(indexDoc)
    expect(bytes).toBeGreaterThan(0)
    expect(bytes).toBeLessThan(TRACK_BESTS_INDEX_MAX_BYTES / 4)
    expect(exceedsTrackBestsIndexSizeGuard(indexDoc)).toBe(false)
    expect(exceedsTrackBestsIndexSizeGuard(indexDoc, 1024)).toBe(true)
  })

  it('il caso limite (ogni categoria, grip e bucket di 30 piste valorizzati) supera la soglia e viene disabilitato', () => {
    const docs = Array.from({ length: 30 }, (_, index) => ({ id: `track_${index}`, data: trackDoc(`track_${index}`, { fullyPopulated: true }) }))
    expect(exceedsTrackBestsIndexSizeGuard(buildTrackBestsIndexDocument(docs))).toBe(true)
  })
})
