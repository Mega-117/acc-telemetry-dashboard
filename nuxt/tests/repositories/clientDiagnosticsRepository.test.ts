import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE,
  CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION,
  CLIENT_DIAGNOSTICS_MAX_COUNT,
  CLIENT_DIAGNOSTICS_PAGE_SIZE,
  CLIENT_DIAGNOSTICS_RETENTION_DAYS,
  ClientDiagnosticsCleanupError,
  countClientDiagnostics,
  countExpiredClientDiagnostics,
  deleteExpiredClientDiagnostics,
  diagnosticRetentionCutoffMs
} from '~/repositories/clientDiagnosticsRepository'

const DAY_MS = 24 * 60 * 60 * 1000

function diagnosticRefs(count: number, offset = 0, receivedAtBase = 1000) {
  return Array.from({ length: count }, (_, index) => ({
    ref: { path: `users/pilot/diagnostics/event-${offset + index}` },
    data: () => ({
      receivedAt: { toMillis: () => receivedAtBase + offset + index }
    })
  }))
}

describe('clientDiagnosticsRepository cleanup', () => {
  it('usa esattamente 50 eventi per pagina', () => {
    expect(CLIENT_DIAGNOSTICS_PAGE_SIZE).toBe(50)
  })
  it('calcola il cutoff a 30 giorni esatti', () => {
    const now = Date.parse('2026-07-31T12:00:00.000Z')
    expect(diagnosticRetentionCutoffMs(now)).toBe(now - CLIENT_DIAGNOSTICS_RETENTION_DAYS * DAY_MS)
  })

  it('normalizza il conteggio remoto a un valore non negativo', async () => {
    const loadCount = vi.fn().mockResolvedValue(-3)
    await expect(countExpiredClientDiagnostics(1234, loadCount)).resolves.toMatchObject({
      total: 0,
      capped: false,
      estimate: { estimatedReads: 2, estimatedWrites: 0 }
    })
    expect(loadCount).toHaveBeenCalledWith(1234, CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  })

  it('limita count e paginazione diagnostica a un massimo esplicito', async () => {
    const filters = {
      startIso: '2026-08-01T00:00:00.000Z',
      endExclusiveIso: '2026-08-02T00:00:00.000Z'
    }
    const loadCount = vi.fn().mockResolvedValue(CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
    await expect(countClientDiagnostics(filters, loadCount)).resolves.toMatchObject({
      total: CLIENT_DIAGNOSTICS_MAX_COUNT,
      capped: true,
      estimate: { maxEstimatedReads: 2 }
    })
    expect(loadCount).toHaveBeenCalledWith(filters, CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  })

  it('elimina in batch bounded e restituisce cursor/progresso deterministici', async () => {
    const loadBatch = vi.fn()
      .mockResolvedValueOnce({ docs: diagnosticRefs(200) })
      .mockResolvedValueOnce({ docs: diagnosticRefs(3, 200) })
    const deleteBatch = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()

    await expect(deleteExpiredClientDiagnostics({
      cutoffMs: 1234,
      loadBatch,
      deleteBatch,
      onProgress
    })).resolves.toMatchObject({
      deleted: 203,
      batches: 2,
      done: true,
      nextCursor: {
        receivedAtMs: 1202,
        path: 'users/pilot/diagnostics/event-202'
      }
    })

    expect(loadBatch).toHaveBeenCalledTimes(2)
    expect(loadBatch).toHaveBeenNthCalledWith(1, 1234, CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE, null)
    expect(loadBatch.mock.calls[1]?.[2]).toEqual({
      receivedAtMs: 1199,
      path: 'users/pilot/diagnostics/event-199'
    })
    expect(deleteBatch).toHaveBeenCalledTimes(2)
    expect(deleteBatch.mock.calls[0][0]).toHaveLength(200)
    expect(deleteBatch.mock.calls[1][0]).toHaveLength(3)
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('non esegue scritture quando non ci sono documenti scaduti', async () => {
    const deleteBatch = vi.fn()
    await expect(deleteExpiredClientDiagnostics({
      loadBatch: vi.fn().mockResolvedValue({ docs: [] }),
      deleteBatch
    })).resolves.toMatchObject({ deleted: 0, batches: 0, done: true })
    expect(deleteBatch).not.toHaveBeenCalled()
  })

  it('ferma ogni azione a cinque batch e restituisce un cursor riprendibile', async () => {
    const loadBatch = vi.fn().mockImplementation((_cutoff, _size, cursor) => {
      const offset = cursor ? Number(cursor.path.split('-').at(-1)) + 1 : 0
      return Promise.resolve({ docs: diagnosticRefs(200, offset) })
    })
    const result = await deleteExpiredClientDiagnostics({
      cutoffMs: 1234,
      loadBatch,
      deleteBatch: vi.fn().mockResolvedValue(undefined)
    })
    expect(result).toMatchObject({
      deleted: 1000,
      batches: CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION,
      done: false,
      estimate: { maxEstimatedReads: 1000, maxEstimatedWrites: 1000 }
    })
    expect(loadBatch).toHaveBeenCalledTimes(CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION)
  })

  it('riprende dopo un batch fallito senza rileggere il batch già confermato', async () => {
    const firstBatch = diagnosticRefs(2)
    const priorCursor = { receivedAtMs: 900, path: 'users/pilot/diagnostics/event-prior' }
    const loadBatch = vi.fn().mockResolvedValue({ docs: firstBatch })
    const deleteBatch = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fault'))
    let failure: unknown
    try {
      await deleteExpiredClientDiagnostics({
        cutoffMs: 1234,
        batchSize: 2,
        maxBatches: 2,
        cursor: priorCursor,
        loadBatch,
        deleteBatch
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(ClientDiagnosticsCleanupError)
    expect((failure as ClientDiagnosticsCleanupError).progress).toMatchObject({
      deleted: 2,
      batches: 1,
      done: false,
      nextCursor: {
        receivedAtMs: 1001,
        path: 'users/pilot/diagnostics/event-1'
      }
    })
    expect(loadBatch.mock.calls[0]?.[2]).toEqual(priorCursor)
    expect(loadBatch.mock.calls[1]?.[2]).toEqual({
      receivedAtMs: 1001,
      path: 'users/pilot/diagnostics/event-1'
    })

    const retryBatch = diagnosticRefs(1, 2)
    const retryLoadBatch = vi.fn().mockResolvedValue({ docs: retryBatch })
    const retryDeleteBatch = vi.fn().mockResolvedValue(undefined)
    await expect(deleteExpiredClientDiagnostics({
      cutoffMs: 1234,
      batchSize: 2,
      maxBatches: 2,
      cursor: (failure as ClientDiagnosticsCleanupError).progress.nextCursor,
      loadBatch: retryLoadBatch,
      deleteBatch: retryDeleteBatch
    })).resolves.toMatchObject({
      deleted: 1,
      batches: 1,
      done: true,
      nextCursor: {
        receivedAtMs: 1002,
        path: 'users/pilot/diagnostics/event-2'
      }
    })
    expect(retryLoadBatch).toHaveBeenCalledWith(1234, 2, {
      receivedAtMs: 1001,
      path: 'users/pilot/diagnostics/event-1'
    })
    expect(retryDeleteBatch).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'users/pilot/diagnostics/event-2' })
    ])
  })

  it('rende idempotente il retry quando il commit riesce ma la risposta fallisce', async () => {
    const docs = diagnosticRefs(2)
    const deletedPaths = new Set<string>()
    const loadBatch = vi.fn().mockResolvedValue({ docs })
    const deleteBatch = vi.fn().mockImplementation(async (refs: Array<{ path: string }>) => {
      refs.forEach(ref => deletedPaths.add(ref.path))
      if (deleteBatch.mock.calls.length === 1) throw new Error('ack perso dopo commit')
    })

    let failure: ClientDiagnosticsCleanupError | null = null
    try {
      await deleteExpiredClientDiagnostics({
        cutoffMs: 1234,
        batchSize: 2,
        maxBatches: 1,
        loadBatch,
        deleteBatch
      })
    } catch (error) {
      failure = error as ClientDiagnosticsCleanupError
    }

    expect(failure).toBeInstanceOf(ClientDiagnosticsCleanupError)
    expect(failure?.progress).toMatchObject({ deleted: 0, nextCursor: null })
    await expect(deleteExpiredClientDiagnostics({
      cutoffMs: 1234,
      batchSize: 2,
      maxBatches: 1,
      cursor: failure?.progress.nextCursor,
      loadBatch,
      deleteBatch
    })).resolves.toMatchObject({ deleted: 2, batches: 1 })
    expect(deleteBatch).toHaveBeenCalledTimes(2)
    expect(deletedPaths.size).toBe(2)
  })
})
