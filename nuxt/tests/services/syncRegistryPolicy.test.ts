import { describe, expect, it } from 'vitest'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import {
  cloudStateFromSessionDocument,
  isRegistryEntryCurrentForFile,
  knownRawChunkIds,
  normalizeRegistryCloudState,
  resolveKnownCloudSession,
  selectFreshReprocessedFiles,
  type RegistryCacheEntry,
  type RegistryCloudState
} from '~/services/sync/syncRegistryPolicy'

// PIP-444: stato cloud della sessione conservato nel registro locale.
describe('registry cloud state (PIP-444)', () => {
  const cloud: RegistryCloudState = {
    sessionId: 'session-id', fileHash: 'abc', rawDataHash: 'raw', summaryRulesVersion: BEST_RULES_VERSION,
    sessionVersion: 3, rawChunkCount: 2, rawSizeBytes: 1_000, rawEncoding: 'json-string'
  }
  const withCloud: RegistryCacheEntry = {
    fileHash: 'abc', mtime: 1, size: 2, uploadedBy: 'uid-current', sessionId: 'session-id',
    uploadedAt: '2026-09-22T00:00:00.000Z', bestRulesVersion: BEST_RULES_VERSION, cloud
  }

  it('normalizza solo un blocco completo e coerente', () => {
    expect(normalizeRegistryCloudState(cloud)).toEqual(cloud)
    expect(normalizeRegistryCloudState({ ...cloud, rawChunkCount: 0 })).toMatchObject({ rawChunkCount: 0 })
    expect(normalizeRegistryCloudState({ ...cloud, sessionVersion: 0 })).toBeNull()
    expect(normalizeRegistryCloudState({ ...cloud, rawChunkCount: 1.5 })).toBeNull()
    expect(normalizeRegistryCloudState({ ...cloud, rawSizeBytes: -1 })).toBeNull()
    expect(normalizeRegistryCloudState({ ...cloud, fileHash: '' })).toBeNull()
    expect(normalizeRegistryCloudState({ ...cloud, rawEncoding: '' })).toBeNull()
    expect(normalizeRegistryCloudState({ ...cloud, sessionId: 7 })).toBeNull()
    expect(normalizeRegistryCloudState(null)).toBeNull()
    expect(normalizeRegistryCloudState([])).toBeNull()
  })

  it('risolve lo stato noto solo per stesso owner, stessa sessione e hash coerente con la voce', () => {
    expect(resolveKnownCloudSession({ entry: withCloud, ownerId: 'uid-current', sessionId: 'session-id' })).toEqual(cloud)
    expect(resolveKnownCloudSession({ entry: withCloud, ownerId: 'uid-other', sessionId: 'session-id' })).toBeNull()
    expect(resolveKnownCloudSession({ entry: withCloud, ownerId: 'uid-current', sessionId: 'another' })).toBeNull()
    expect(resolveKnownCloudSession({ entry: { ...withCloud, fileHash: 'zzz' }, ownerId: 'uid-current', sessionId: 'session-id' })).toBeNull()
    expect(resolveKnownCloudSession({ entry: { ...withCloud, cloud: { ...cloud, sessionId: 'x' } }, ownerId: 'uid-current', sessionId: 'session-id' })).toBeNull()
    expect(resolveKnownCloudSession({ entry: { ...withCloud, cloud: undefined }, ownerId: 'uid-current', sessionId: 'session-id' })).toBeNull()
    expect(resolveKnownCloudSession({ entry: null, ownerId: 'uid-current', sessionId: 'session-id' })).toBeNull()
  })

  it('deriva lo stato da un documento sessione e gli id dei chunk sono 0..n-1', () => {
    expect(cloudStateFromSessionDocument('session-id', {
      fileHash: 'abc', rawDataHash: 'raw', version: 3, rawChunkCount: 2, rawSizeBytes: 1_000, rawEncoding: 'json-string',
      summary: { best_rules_version: BEST_RULES_VERSION }
    })).toEqual(cloud)
    expect(cloudStateFromSessionDocument('session-id', { fileHash: 'abc', version: 1, summaryRulesVersion: 2 }))
      .toEqual({ ...cloud, rawDataHash: '', sessionVersion: 1, summaryRulesVersion: 2, rawChunkCount: 0, rawSizeBytes: 0 })
    expect(cloudStateFromSessionDocument('session-id', { version: 0 })).toBeNull()
    expect(cloudStateFromSessionDocument('session-id', null)).toBeNull()
    expect(knownRawChunkIds(cloud)).toEqual(['0', '1'])
    expect(knownRawChunkIds({ ...cloud, rawChunkCount: 0 })).toEqual([])
  })
})

const file = {
  name: 'session.json',
  mtime: 100,
  size: 200,
  sessionId: 'session-id',
  fileHash: 'abc',
  bestRulesVersion: BEST_RULES_VERSION
}
const entry: RegistryCacheEntry = {
  fileHash: 'abc',
  mtime: 100,
  size: 200,
  uploadedBy: 'uid-current',
  sessionId: 'session-id',
  uploadedAt: '2026-08-18T00:00:00.000Z',
  bestRulesVersion: BEST_RULES_VERSION
}

describe('syncRegistryPolicy', () => {
  it('accepts only exact owner, session, byte metadata, hash and rules', () => {
    expect(isRegistryEntryCurrentForFile({
      entry,
      file,
      ownerId: 'uid-current',
      sessionId: 'session-id'
    })).toBe(true)

    const cases: Array<[string, RegistryCacheEntry | null, typeof file, string, string | undefined]> = [
      ['missing entry', null, file, 'uid-current', 'session-id'],
      ['foreign owner', { ...entry, uploadedBy: 'uid-other' }, file, 'uid-current', 'session-id'],
      ['missing session', { ...entry, sessionId: '' }, file, 'uid-current', 'session-id'],
      ['wrong session', { ...entry, sessionId: 'other' }, file, 'uid-current', 'session-id'],
      ['missing hash', { ...entry, fileHash: '' }, file, 'uid-current', 'session-id'],
      ['wrong current hash', entry, { ...file, fileHash: 'other' }, 'uid-current', 'session-id'],
      ['wrong current session', entry, { ...file, sessionId: 'other' }, 'uid-current', undefined],
      ['stale mtime', entry, { ...file, mtime: 101 }, 'uid-current', 'session-id'],
      ['stale size', entry, { ...file, size: 201 }, 'uid-current', 'session-id'],
      ['missing mtime', { ...entry, mtime: Number.NaN }, file, 'uid-current', 'session-id'],
      ['old rules', { ...entry, bestRulesVersion: BEST_RULES_VERSION - 1 }, file, 'uid-current', 'session-id'],
      ['missing current rules', entry, { ...file, bestRulesVersion: undefined }, 'uid-current', 'session-id']
    ]
    for (const [label, candidate, candidateFile, ownerId, sessionId] of cases) {
      expect(
        isRegistryEntryCurrentForFile({
          entry: candidate,
          file: candidateFile,
          ownerId,
          sessionId
        }),
        label
      ).toBe(false)
    }
  })

  it('selects only fresh requested basenames and has no stale fallback', () => {
    expect(selectFreshReprocessedFiles([
      { name: 'owned.json', mtime: 20, size: 30, sessionId: 'old', fileHash: 'old', bestRulesVersion: BEST_RULES_VERSION },
      { name: 'foreign.json', mtime: 40, size: 50, sessionId: 'foreign', fileHash: 'foreign', bestRulesVersion: BEST_RULES_VERSION },
      { name: '../owned.json', mtime: 60, size: 70, sessionId: 'escape', fileHash: 'escape', bestRulesVersion: BEST_RULES_VERSION },
      { name: 'owned.json', mtime: 21, size: 31, sessionId: 'fresh', fileHash: 'fresh', bestRulesVersion: BEST_RULES_VERSION }
    ], ['owned.json'])).toEqual([
      { name: 'owned.json', mtime: 21, size: 31, sessionId: 'fresh', fileHash: 'fresh', bestRulesVersion: BEST_RULES_VERSION }
    ])
    expect(selectFreshReprocessedFiles(undefined, ['owned.json'])).toEqual([])
  })
})
