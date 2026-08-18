import { describe, expect, it } from 'vitest'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import {
  isRegistryEntryCurrentForFile,
  selectFreshReprocessedFiles,
  type RegistryCacheEntry
} from '~/services/sync/syncRegistryPolicy'

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
