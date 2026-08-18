import { afterEach, describe, expect, it, vi } from 'vitest'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { loadLocalTelemetrySessions } from '~/repositories/telemetryLocalRepository'
import { ensureLocalTelemetrySummariesCanonical } from '~/utils/localCanonicalSummary'
import { createSyncMaintenanceService, SYNC_DESTRUCTIVE_MAINTENANCE_CONFIRMATION } from '~/services/sync/syncMaintenanceService'
import { createSyncQueueService } from '~/services/sync/syncQueueService'
import { createSyncScanService } from '~/services/sync/syncScanService'

function makeSession(ownerId: string | null, lapsTotal = 3) {
  return {
    ownerId,
    session_info: {
      date_start: '2026-08-17T20:00:00.000Z',
      track: 'monza',
      car_model: 'ferrari_296_gt3',
      session_type: 0,
      laps_total: lapsTotal,
      laps_valid: lapsTotal,
      total_drive_time_ms: 120000
    },
    summary: {
      best_rules_version: BEST_RULES_VERSION,
      laps: lapsTotal,
      lapsValid: lapsTotal,
      bestLap: 100000,
      avgCleanLap: 101000,
      totalTime: 120000,
      stintCount: 1,
      provenance: { source: 'python' }
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderer local-session authority contract', () => {
  it('scans by basename and fails closed on missing or foreign owners', async () => {
    const rawByName: Record<string, any> = {
      'owned-zero.json': makeSession('uid-current', 0),
      'ownerless.json': makeSession(null),
      'foreign.json': makeSession('uid-foreign')
    }
    const readFile = vi.fn(async (fileName: string) => rawByName[fileName])
    const service = createSyncScanService({
      electronAPI: {
        getTelemetryFiles: async () => [
          { name: 'owned-zero.json', mtime: 1, size: 10 },
          { name: 'ownerless.json', mtime: 2, size: 10 },
          { name: 'foreign.json', mtime: 3, size: 10 }
        ],
        readFile
      },
      loadRegistryCache: async () => ({}),
      calculateContentHash: async () => 'unused'
    })

    const result = await service.scanPendingFiles({ ownerId: 'uid-current' })

    expect(readFile.mock.calls.map(([fileName]) => fileName)).toEqual([
      'owned-zero.json',
      'ownerless.json',
      'foreign.json'
    ])
    expect(result.skippedFiles.map(({ fileName, reason }) => [fileName, reason])).toEqual([
      ['owned-zero.json', 'zero_laps'],
      ['ownerless.json', 'owner_missing'],
      ['foreign.json', 'owner_mismatch']
    ])
    expect(result.scannedFiles.every((file) => !('path' in file))).toBe(true)
  })

  it('re-lists main-owned descriptors for changed basenames before metadata fast-path', async () => {
    const freshDescriptor = {
      name: 'owned.json',
      mtime: 20,
      size: 30,
      sessionId: 'session-id',
      fileHash: 'fresh-hash',
      bestRulesVersion: BEST_RULES_VERSION
    }
    const getTelemetryFiles = vi.fn(async () => [
      freshDescriptor,
      { ...freshDescriptor, name: 'other.json' }
    ])
    const readFile = vi.fn()
    const service = createSyncScanService({
      electronAPI: { getTelemetryFiles, readFile },
      loadRegistryCache: async () => ({
        'owned.json': {
          uploadedBy: 'uid-current',
          uploadedAt: '2026-08-18T00:00:00.000Z',
          sessionId: 'session-id',
          fileHash: 'fresh-hash',
          mtime: 20,
          size: 30,
          bestRulesVersion: BEST_RULES_VERSION
        }
      }),
      calculateContentHash: async () => 'unused'
    })

    const result = await service.scanPendingFiles({
      ownerId: 'uid-current',
      fileNames: ['owned.json']
    })

    expect(getTelemetryFiles).toHaveBeenCalledTimes(1)
    expect(result.scannedFiles).toEqual([freshDescriptor])
    expect(result.unchangedFiles).toHaveLength(1)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('normal maintenance performs no deletion and destructive branches require a token', async () => {
    const cleanupSyncedFiles = vi.fn()
    const getDocsFn = vi.fn()
    const deleteDocFn = vi.fn()
    const service = createSyncMaintenanceService({
      electronAPI: { cleanupSyncedFiles },
      updateSuiteVersion: vi.fn(async () => false),
      canonicalizeSummary: vi.fn(),
      getDocsFn,
      setDocFn: vi.fn(),
      deleteDocFn,
      db: {},
      bestRulesVersion: BEST_RULES_VERSION,
      syncedFilesRetentionDays: 30
    })

    await expect(service.runMaintenance({
      uid: 'uid-default',
      interactive: true,
      updateVersion: false
    })).resolves.toMatchObject({ cleanedZeroLap: 0, retentionRan: false })
    expect(getDocsFn).not.toHaveBeenCalled()
    expect(deleteDocFn).not.toHaveBeenCalled()
    expect(cleanupSyncedFiles).not.toHaveBeenCalled()

    await expect(service.runMaintenance({
      uid: 'uid-denied',
      runZeroLapCleanup: true,
      updateVersion: false
    })).rejects.toThrow(/destructive-maintenance-confirmation-required/)

    await expect(service.runMaintenance({
      uid: 'uid-explicit',
      runRetentionCleanup: true,
      updateVersion: false,
      destructiveConfirmation: SYNC_DESTRUCTIVE_MAINTENANCE_CONFIRMATION
    })).resolves.toMatchObject({ retentionRan: true })
    expect(cleanupSyncedFiles).toHaveBeenCalledWith({
      retentionDays: 30,
      confirmation: 'DELETE_SYNCED_LOCAL_SESSION_FILES'
    })
  })

  it('canonical reprocess and local repository use basenames only', async () => {
    const owned = makeSession('uid-current')
    const ownerless = makeSession(null)
    const reprocessTelemetrySummaries = vi.fn(async () => ({ ok: true, processed: 1 }))
    const readFile = vi.fn(async (fileName: string) => (
      fileName === 'owned.json' ? owned : ownerless
    ))
    const electronAPI = {
      reprocessTelemetrySummaries,
      getTelemetryFiles: vi.fn(async () => [
        { name: 'owned.json', mtime: 1, size: 10 },
        { name: 'ownerless.json', mtime: 2, size: 10 }
      ]),
      readFile,
      getRegistry: vi.fn(async () => ({}))
    }
    vi.stubGlobal('window', { electronAPI })

    await ensureLocalTelemetrySummariesCanonical({
      fileNames: ['owned.json', 'owned.json']
    })
    expect(reprocessTelemetrySummaries).toHaveBeenCalledWith({ fileNames: ['owned.json'] })

    const sessions = await loadLocalTelemetrySessions({
      electronAPI,
      ownerId: 'uid-current',
      isOnline: false
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.fileName).toBe('owned.json')
    expect(readFile.mock.calls.every(([fileName]) => !String(fileName).includes('\\') && !String(fileName).includes('/')))
      .toBe(true)
  })

  it('marks local data synced only while registry metadata still matches the file', async () => {
    const owned = makeSession('uid-current')
    const sessionId = '2026_08_17T20_00_00_monza'
    let descriptor = {
      name: 'owned.json',
      mtime: 10,
      size: 100,
      sessionId,
      fileHash: 'hash',
      bestRulesVersion: BEST_RULES_VERSION
    }
    const electronAPI = {
      getTelemetryFiles: vi.fn(async () => [descriptor]),
      readFile: vi.fn(async () => owned),
      getRegistry: vi.fn(async () => ({
        'owned.json': {
          uploadedBy: 'uid-current',
          uploadedAt: '2026-08-18T00:00:00.000Z',
          sessionId,
          fileHash: 'hash',
          mtime: 10,
          size: 100,
          bestRulesVersion: BEST_RULES_VERSION
        }
      }))
    }

    await expect(loadLocalTelemetrySessions({
      electronAPI,
      ownerId: 'uid-current',
      isOnline: true
    })).resolves.toEqual([
      expect.objectContaining({ syncState: 'synced' })
    ])

    descriptor = { ...descriptor, mtime: 11 }
    await expect(loadLocalTelemetrySessions({
      electronAPI,
      ownerId: 'uid-current',
      isOnline: true
    })).resolves.toEqual([
      expect.objectContaining({ syncState: 'pending_sync' })
    ])

    descriptor = { ...descriptor, mtime: 10, fileHash: 'replacement-hash' }
    await expect(loadLocalTelemetrySessions({
      electronAPI,
      ownerId: 'uid-current',
      isOnline: true
    })).resolves.toEqual([
      expect.objectContaining({ syncState: 'pending_sync' })
    ])
  })

  it('queue identity is the basename, never an absolute path', () => {
    const queue = createSyncQueueService()
    queue.enqueue([
      { fileName: 'session.json', sessionId: 'a' },
      { fileName: 'session.json', sessionId: 'b' }
    ] as any)
    expect(queue.size()).toBe(1)
  })

  it('reports queue lifecycle and drains each unique item into a reconciled result', async () => {
    const onStatusChange = vi.fn()
    const queue = createSyncQueueService({ onStatusChange })
    expect(queue.getStatus()).toBe('idle')

    expect(queue.enqueue([
      { fileName: 'first.json', sessionId: 'session-a' },
      { fileName: 'second.json', sessionId: 'session-b' }
    ] as any)).toBe(2)
    expect(queue.getStatus()).toBe('queued')

    const processor = vi.fn(async (item: any) => ({
      result: item.fileName,
      didChange: true,
      dirtySessionId: item.sessionId,
      dirtyTrack: 'spa'
    }))
    await expect(queue.drain(processor)).resolves.toEqual({
      results: ['first.json', 'second.json'],
      dirtySessionIds: ['session-a', 'session-b'],
      dirtyTracks: ['spa'],
      changedCount: 2
    })

    expect(processor).toHaveBeenCalledTimes(2)
    expect(queue.size()).toBe(0)
    expect(queue.getStatus()).toBe('idle')
    expect(onStatusChange.mock.calls.map(([status]) => status)).toEqual([
      'queued',
      'uploading',
      'idle'
    ])
  })

  it('clears queued work and returns the queue to idle', () => {
    const onStatusChange = vi.fn()
    const queue = createSyncQueueService({ onStatusChange })
    queue.enqueue([{ fileName: 'pending.json', sessionId: 'session-a' }] as any)

    queue.clear()

    expect(queue.size()).toBe(0)
    expect(queue.getStatus()).toBe('idle')
    expect(onStatusChange).toHaveBeenLastCalledWith('idle')
  })
})
