// PIP-444 (b): un documento per pista, lettura a doppia forma, unione per audit/migrazione.
import { describe, expect, it } from 'vitest'
import {
  TRACK_PROJECTION_SCHEMA_VERSION,
  buildTrackProjectionDocument,
  buildTrackProjectionSectionWrite,
  collectTrackProjectionSections,
  isTrackProjectionDocument,
  loadTrackProjectionSections,
  splitTrackProjectionDocument,
  trackProjectionPath
} from '~/services/sync/trackProjectionDocument'

const legacyBests = { version: 4, bestRulesVersion: 5, trackId: 'monza', bests: {}, activity: { sessionCount: 1 }, syncedSessionIds: ['s1'], lastSessionDate: null }
const legacyDetail = { schemaVersion: 2, trackId: 'monza', lastSessionDate: null, categories: {} }
const merged = buildTrackProjectionDocument({ trackId: 'monza', bests: legacyBests, detail: legacyDetail })

describe('trackProjectionDocument', () => {
  it('riconosce il documento unito e mai i vecchi documenti (version / categories)', () => {
    expect(isTrackProjectionDocument(merged)).toBe(true)
    expect(isTrackProjectionDocument({ schemaVersion: 1, trackId: 'monza' })).toBe(true)
    expect(isTrackProjectionDocument({ schemaVersion: 1, trackId: 'monza', bests: null, detail: null })).toBe(true)
    expect(isTrackProjectionDocument(legacyBests)).toBe(false)
    expect(isTrackProjectionDocument(legacyDetail)).toBe(false)
    expect(isTrackProjectionDocument({ ...legacyDetail, schemaVersion: 1 })).toBe(false)
    expect(isTrackProjectionDocument({ schemaVersion: 2, trackId: 'monza', bests: {} })).toBe(false)
    expect(isTrackProjectionDocument({ schemaVersion: 1, trackId: 'monza', bests: 'x' })).toBe(false)
    expect(isTrackProjectionDocument(null)).toBe(false)
  })

  it('costruisce, divide e scrive una sezione con mergeFields (sostituzione intera della sezione)', () => {
    expect(merged).toEqual({ schemaVersion: TRACK_PROJECTION_SCHEMA_VERSION, trackId: 'monza', bests: legacyBests, detail: legacyDetail })
    expect(splitTrackProjectionDocument(merged)).toEqual({ bests: legacyBests, detail: legacyDetail })
    expect(splitTrackProjectionDocument(legacyBests)).toEqual({ bests: null, detail: null })
    expect(buildTrackProjectionDocument({ trackId: 'spa', bests: undefined, detail: 'no' as never, updatedAt: 'now' }))
      .toEqual({ schemaVersion: 1, trackId: 'spa', bests: null, detail: null, updatedAt: 'now' })
    expect(buildTrackProjectionSectionWrite({ trackId: 'monza', section: 'bests', data: legacyBests, updatedAt: 'ts' })).toEqual({
      data: { schemaVersion: 1, trackId: 'monza', bests: legacyBests, updatedAt: 'ts' },
      options: { mergeFields: ['schemaVersion', 'trackId', 'bests', 'updatedAt'] }
    })
    expect(buildTrackProjectionSectionWrite({ trackId: 'monza', section: 'detail', data: legacyDetail }).options)
      .toEqual({ mergeFields: ['schemaVersion', 'trackId', 'detail'] })
    expect(trackProjectionPath('u', 'monza')).toBe('users/u/trackProjections/monza')
  })

  describe('loadTrackProjectionSections', () => {
    function reader(store: Record<string, unknown>) {
      const reads: string[] = []
      return {
        reads,
        getDocFn: async (path: string) => { reads.push(path); return { exists: () => store[path] !== undefined, data: () => store[path] } },
        docFn: (_db: unknown, path: string) => path
      }
    }

    it('documento unito presente: una lettura, entrambe le sezioni', async () => {
      const io = reader({ 'users/u/trackProjections/monza': merged })
      const result = await loadTrackProjectionSections({ db: {}, uid: 'u', trackId: 'monza', getDocFn: io.getDocFn, docFn: io.docFn })
      expect(result).toEqual({ bests: legacyBests, detail: legacyDetail, source: 'merged' })
      expect(io.reads).toEqual(['users/u/trackProjections/monza'])
    })

    it('documento unito assente: legge solo i vecchi documenti delle sezioni richieste', async () => {
      const io = reader({ 'users/u/trackBests/monza': legacyBests, 'users/u/trackDetailProjections/monza': legacyDetail })
      const bests = await loadTrackProjectionSections({ db: {}, uid: 'u', trackId: 'monza', sections: ['bests'], getDocFn: io.getDocFn, docFn: io.docFn })
      expect(bests).toEqual({ bests: legacyBests, detail: null, source: 'legacy' })
      expect(io.reads).toEqual(['users/u/trackProjections/monza', 'users/u/trackBests/monza'])
      io.reads.length = 0
      const both = await loadTrackProjectionSections({ db: {}, uid: 'u', trackId: 'monza', getDocFn: io.getDocFn, docFn: io.docFn })
      expect(both).toEqual({ bests: legacyBests, detail: legacyDetail, source: 'legacy' })
      expect(io.reads).toHaveLength(3)
    })

    it('nulla, oppure un lettore che risponde con un vecchio documento a ogni percorso', async () => {
      const none = reader({})
      expect(await loadTrackProjectionSections({ db: {}, uid: 'u', trackId: 'x', getDocFn: none.getDocFn, docFn: none.docFn }))
        .toEqual({ bests: null, detail: null, source: 'none' })
      const sameEverywhere = { getDocFn: async () => ({ exists: () => true, data: () => legacyDetail }), docFn: (_db: unknown, path: string) => path }
      const result = await loadTrackProjectionSections({ db: {}, uid: 'u', trackId: 'monza', sections: ['detail'], ...sameEverywhere })
      expect(result).toEqual({ bests: null, detail: legacyDetail, source: 'legacy' })
    })
  })

  it('collectTrackProjectionSections: documento unito preferito, vecchi documenti solo dove manca, elenco unmerged', () => {
    const result = collectTrackProjectionSections({
      merged: [{ id: 'monza', data: merged }, { id: 'broken', data: legacyBests }],
      legacyBests: [{ id: 'monza', data: { ...legacyBests, version: 1 } }, { id: 'spa', data: { ...legacyBests, trackId: 'spa' } }],
      legacyDetail: [{ id: 'imola', data: { ...legacyDetail, trackId: 'imola' } }]
    })
    expect(result.mergedTrackIds).toEqual(['monza'])
    expect(result.bests.get('monza')).toEqual(legacyBests)
    expect(result.bests.get('spa')).toMatchObject({ trackId: 'spa' })
    expect(result.detail.get('imola')).toMatchObject({ trackId: 'imola' })
    expect(result.detail.get('monza')).toEqual(legacyDetail)
    expect(result.unmerged).toEqual(['imola', 'spa'])
  })
})
