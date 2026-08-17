import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  batch: null as any
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (parent: any, path: string) => ({
    path: parent?.path ? `${parent.path}/${path}` : path
  }),
  serverTimestamp: () => ({ serverTimestamp: true })
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedWriteBatch: () => mocks.batch
}))

import { createSessionUploadService } from '~/services/sync/sessionUploadService'

function canonicalRaw() {
  return {
    ownerId: 'pilot-a',
    session_info: {
      track: 'spa',
      date_start: '2026-08-18T00:00:00.000Z',
      car_model: 'amr_v8_vantage_gt3',
      session_type: 2,
      laps_total: 2,
      laps_valid: 2,
      session_best_lap: 137000,
      avg_clean_lap: 138000,
      total_drive_time_ms: 280000
    },
    stints: [{ laps: [{ lap_time_ms: 137000, is_valid: true }] }],
    summary: {
      best_rules_version: 5,
      laps: 2,
      lapsValid: 2,
      bestLap: 137000,
      avgCleanLap: 138000,
      totalTime: 280000,
      stintCount: 1,
      provenance: { source: 'pip317-test' }
    }
  }
}

function makeService(chunkSize: number, assertActive: () => void = () => {}) {
  return createSessionUploadService({
    db: {},
    chunkSize,
    getExistingSession: async () => ({
      fileHash: 'old-hash',
      rawDataHash: 'old-raw-hash',
      summaryRulesVersion: 5,
      rawSizeBytes: 240,
      rawEncoding: 'json-string',
      version: 1,
      summary: { best_rules_version: 5 }
    }),
    loadRegistryCache: async () => ({}),
    canSkipViaRegistry: () => false,
    listExistingChunks: async () => [
      { id: '0', ref: { path: 'users/pilot-a/sessions/session/rawChunks/0' } },
      { id: '1', ref: { path: 'users/pilot-a/sessions/session/rawChunks/1' } },
      { id: '2', ref: { path: 'users/pilot-a/sessions/session/rawChunks/2' } }
    ],
    assertActive
  })
}

describe('session upload raw chunk atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => new Uint8Array(32).buffer)
      }
    })
    mocks.batch = {
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(async () => undefined)
    }
  })

  it('sostituisce chunk e tail obsoleti nello stesso unico batch', async () => {
    const raw = canonicalRaw()
    const rawText = JSON.stringify(raw)
    const result = await makeService(Math.ceil(rawText.length / 2)).uploadOrUpdateSession(
      raw,
      rawText,
      'spa.json',
      'pilot-a',
      { precomputedHash: 'new-hash' }
    )

    expect(result.status).toBe('updated')
    expect(mocks.batch.commit).toHaveBeenCalledOnce()
    const chunkSets = mocks.batch.set.mock.calls
      .map((call: any[]) => call[0]?.path)
      .filter((path: string) => path?.includes('/rawChunks/'))
    const chunkDeletes = mocks.batch.delete.mock.calls.map((call: any[]) => call[0]?.path)
    expect(chunkSets).toHaveLength(2)
    expect(chunkDeletes).toEqual([expect.stringContaining('/rawChunks/2')])
  })

  it('non committa set o delete accodati se il lease scade prima del commit', async () => {
    let active = true
    mocks.batch.delete.mockImplementation(() => { active = false })
    const raw = canonicalRaw()
    const rawText = JSON.stringify(raw)
    const result = await makeService(Math.ceil(rawText.length / 2), () => {
      if (!active) throw new Error('cloud_owner_lease_stale')
    }).uploadOrUpdateSession(
      raw,
      rawText,
      'spa.json',
      'pilot-a',
      { precomputedHash: 'new-hash' }
    )

    expect(result).toMatchObject({ status: 'error', error: 'cloud_owner_lease_stale' })
    expect(mocks.batch.commit).not.toHaveBeenCalled()
  })
})
