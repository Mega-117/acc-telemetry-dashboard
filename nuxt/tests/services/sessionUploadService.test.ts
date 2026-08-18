import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { createSessionUploadService, prepareSummaryForUpload } from '~/services/sync/sessionUploadService'

const uploadMocks = vi.hoisted(() => ({
  trackedWriteBatch: vi.fn()
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: 'doc', parts })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true }))
}))

vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedWriteBatch: uploadMocks.trackedWriteBatch
}))

function makeLegacyRaceRaw(overrides: Record<string, unknown> = {}) {
  return {
    session_info: {
      track: 'spa',
      date_start: '2026-06-01T10:00:00',
      car_model: 'amr_v8_vantage_gt3',
      session_type: 2,
      laps_total: 6,
      laps_valid: 6,
      session_best_lap: 137000,
      avg_clean_lap: 138000,
      total_drive_time_ms: 900000
    },
    stints: [
      {
        fuel_start: 65,
        avg_clean_lap: 138000,
        laps: [
          { lap_time_ms: 137900, is_valid: true, fuel_start: 65, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 137500, is_valid: true, fuel_start: 64, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 137000, is_valid: true, fuel_start: 63, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 138200, is_valid: true, fuel_start: 62, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 138100, is_valid: true, fuel_start: 61, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 138300, is_valid: true, fuel_start: 60, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' }
        ]
      }
    ],
    summary: {
      best_rules_version: 1,
      best_race_ms: null,
      best_by_grip: null
    },
    ...overrides
  }
}

describe('prepareSummaryForUpload', () => {
  it.each([
    [null, 'owner_missing'],
    ['uid-foreign', 'owner_mismatch']
  ])('nega prima di ogni cloud I/O un owner locale %s', async (ownerId, reason) => {
    const getExistingSession = vi.fn()
    const loadRegistryCache = vi.fn()
    const service = createSessionUploadService({
      db: {},
      chunkSize: 100,
      getExistingSession,
      loadRegistryCache,
      canSkipViaRegistry: () => false,
      listExistingChunks: vi.fn()
    })

    await expect(service.uploadOrUpdateSession(
      { ownerId, session_info: { laps_total: 1 } },
      '{}',
      'session.json',
      'uid-current'
    )).resolves.toMatchObject({ status: 'skipped', reason })
    expect(getExistingSession).not.toHaveBeenCalled()
    expect(loadRegistryCache).not.toHaveBeenCalled()
  })

  it('richiede il reprocess Python per un JSON locale legacy anche se contiene raw/stint', () => {
    const prepared = prepareSummaryForUpload(makeLegacyRaceRaw())

    expect(prepared.ok).toBe(false)
    if (prepared.ok) throw new Error('expected skipped legacy local summary')
    expect(prepared.reason).toBe('legacy_local_requires_reprocess')
  })

  it('preserva esattamente il summary V5 Python anche quando diverge dai raw', () => {
    const canonicalSummary = {
      best_rules_version: BEST_RULES_VERSION,
      laps: 6,
      lapsValid: 6,
      bestLap: 137000,
      avgCleanLap: 138000,
      totalTime: 900000,
      stintCount: 1,
      best_qualy_ms: null,
      best_qualy_conditions: null,
      best_session_race_ms: 139999,
      best_session_race_conditions: { airTemp: 19, roadTemp: 27, grip: 'Fast' },
      best_race_ms: 139999,
      best_race_conditions: { airTemp: 19, roadTemp: 27, grip: 'Fast' },
      best_avg_race_ms: 138000,
      best_avg_race_conditions: { airTemp: 19, roadTemp: 27, grip: 'Fast' },
      best_by_grip: { Fast: { source: 'python_fixture' } },
      provenance: { source: 'python', generated_at: '2026-08-14T10:00:00.000Z' }
    }
    const raw = makeLegacyRaceRaw({
      summary: canonicalSummary
    })
    raw.stints[0].avg_clean_lap = 138000.5
    const prepared = prepareSummaryForUpload(raw)

    expect(prepared.ok).toBe(true)
    if (!prepared.ok) throw new Error('expected uploadable summary')

    expect(prepared.summarySource).toBe('canonical')
    expect(prepared.summary).toBe(canonicalSummary)
    expect(prepared.summary).toEqual(canonicalSummary)
    expect(prepared.summary.best_race_ms).toBe(139999)
    expect(prepared.summary.provenance.source).toBe('python')
  })

  it('riproduce un file storico con trace normalizzata 50 Hz senza reinterpretarne il summary', () => {
    const canonicalSummary = {
      best_rules_version: BEST_RULES_VERSION,
      best_avg_race_ms: 100500,
      provenance: { source: 'python', generated_at: '2026-08-14T10:00:00.000Z' }
    }
    const normalizedTrace = Array.from({ length: 6 }, (_, index) => ({
      timestamp_ms: index * 20,
      speed_kmh: 120 + index
    }))
    const recordedFile = makeLegacyRaceRaw({
      summary: canonicalSummary,
      telemetry_trace: { sample_rate_hz: 50, samples: normalizedTrace }
    })
    const replayedFile = JSON.parse(JSON.stringify(recordedFile))
    const replayedTrace = replayedFile.telemetry_trace.samples as Array<{ timestamp_ms: number }>

    expect(replayedTrace.slice(1).every((sample, index) => (
      sample.timestamp_ms - replayedTrace[index].timestamp_ms === 20
    ))).toBe(true)

    const prepared = prepareSummaryForUpload(replayedFile)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) throw new Error('expected uploadable replay summary')
    expect(prepared.summary).toBe(replayedFile.summary)
    expect(prepared.summary).toEqual(canonicalSummary)
  })

  it('mantiene il reprocess Python prima di rescan e upload, quindi un bridge fallito resta fail-closed', () => {
    const syncSource = readFileSync(
      fileURLToPath(new URL('../../app/composables/useElectronSync.ts', import.meta.url)),
      'utf8'
    )
    const boundaryAt = syncSource.indexOf('const reprocessResult = await runLocalMutationBoundary({')
    const reprocessAt = syncSource.indexOf('run: () => ensureLocalTelemetrySummariesCanonical({', boundaryAt)
    const failClosedAt = syncSource.indexOf('if (reprocessResult?.ok !== true)', reprocessAt)
    const freshDescriptorsAt = syncSource.indexOf('fileNames: requestedFileNames', reprocessAt)
    const rescanAt = syncSource.indexOf('const rescanned = await getScanService().scanPendingFiles({', reprocessAt)
    const uploadAt = syncSource.indexOf('const result: SyncResult = await uploadService.uploadOrUpdateSession(', rescanAt)
    const journalAt = syncSource.indexOf('mutationJournal.recordUploadMutation({', uploadAt)
    const postUploadAssertAt = syncSource.indexOf('assertLeaseCurrent(isCurrent)', journalAt)

    expect(boundaryAt).toBeGreaterThan(-1)
    expect(reprocessAt).toBeGreaterThan(boundaryAt)
    expect(failClosedAt).toBeGreaterThan(reprocessAt)
    expect(freshDescriptorsAt).toBeGreaterThan(reprocessAt)
    expect(rescanAt).toBeGreaterThan(reprocessAt)
    expect(uploadAt).toBeGreaterThan(rescanAt)
    expect(journalAt).toBeGreaterThan(uploadAt)
    expect(postUploadAssertAt).toBeGreaterThan(journalAt)
    expect(syncSource).not.toContain('files: pendingFiles.map((file) => file.file)')
    expect(syncSource).not.toContain('reprocessResult?.files')
    expect(syncSource).toContain('fileNames: requestedFileNames')
  })

  it('segnala una commit cloud riuscita anche se la lease diventa stale subito dopo', async () => {
    let active = true
    const batch = {
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(async () => { active = false })
    }
    uploadMocks.trackedWriteBatch.mockReturnValueOnce(batch)
    const service = createSessionUploadService({
      db: {},
      chunkSize: 100000,
      getExistingSession: vi.fn(async () => null),
      loadRegistryCache: vi.fn(async () => ({})),
      canSkipViaRegistry: () => false,
      listExistingChunks: vi.fn(async () => []),
      assertActive: () => {
        if (!active) throw new Error('cloud_owner_lease_stale')
      }
    })
    const raw = makeLegacyRaceRaw({
      ownerId: 'uid-current',
      summary: {
        best_rules_version: BEST_RULES_VERSION,
        provenance: { source: 'python' }
      }
    })

    await expect(service.uploadOrUpdateSession(
      raw,
      JSON.stringify(raw),
      'session.json',
      'uid-current'
    )).resolves.toMatchObject({
      status: 'error',
      committedStatus: 'created',
      sessionId: expect.any(String),
      projectionDelta: expect.objectContaining({ trackId: 'spa' }),
      error: 'cloud_owner_lease_stale'
    })
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })

  it('salta un JSON locale legacy senza stints invece di promuovere solo il numero versione', () => {
    const prepared = prepareSummaryForUpload(makeLegacyRaceRaw({ stints: [] }))

    expect(prepared.ok).toBe(false)
    if (prepared.ok) throw new Error('expected skipped legacy local summary')
    expect(prepared.reason).toBe('legacy_local_requires_reprocess')
  })
})
