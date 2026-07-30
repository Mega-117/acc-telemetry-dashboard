import { describe, expect, it } from 'vitest'
import {
  clearTrustedRuntimeCompatibility,
  readTrustedRuntimeCompatibility,
  writeTrustedRuntimeCompatibility
} from '~/services/runtime/runtimeCompatibilityCache'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }
  }
}

describe('runtimeCompatibilityCache', () => {
  it('riusa solo uno snapshot UID/version-scoped e read-compatible', () => {
    const storage = memoryStorage()
    expect(writeTrustedRuntimeCompatibility({
      storage,
      record: {
        schemaVersion: 1,
        policyVersion: 1,
        uid: 'uid-1',
        migrationVersion: 5,
        bestRulesVersion: 5,
        health: 'partial',
        mode: 'write_critical',
        issues: ['raw_data_unavailable'],
        checkedAt: '2026-07-30T18:00:00.000Z'
      }
    })).toBe(true)

    expect(readTrustedRuntimeCompatibility({
      storage,
      uid: 'uid-1',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: Date.parse('2026-07-30T19:00:00.000Z')
    })).toMatchObject({
      health: 'partial',
      compatibility: { trusted: true, offlineCachedRead: true }
    })
    expect(readTrustedRuntimeCompatibility({
      storage,
      uid: 'uid-2',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })).toBeNull()
  })

  it('fallisce chiuso per record scaduto/corrotto e dopo invalidazione', () => {
    const storage = memoryStorage()
    writeTrustedRuntimeCompatibility({
      storage,
      record: {
        schemaVersion: 1,
        policyVersion: 1,
        uid: 'uid-1',
        migrationVersion: 5,
        bestRulesVersion: 5,
        health: 'healthy',
        mode: 'write_critical',
        issues: [],
        checkedAt: '2026-07-28T18:00:00.000Z'
      }
    })
    expect(readTrustedRuntimeCompatibility({
      storage,
      uid: 'uid-1',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: Date.parse('2026-07-30T19:00:00.000Z')
    })).toBeNull()
    clearTrustedRuntimeCompatibility(storage, 'uid-1')
    expect(readTrustedRuntimeCompatibility({
      storage,
      uid: 'uid-1',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })).toBeNull()
  })
})
