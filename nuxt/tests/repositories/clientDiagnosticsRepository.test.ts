import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE,
  CLIENT_DIAGNOSTICS_PAGE_SIZE,
  CLIENT_DIAGNOSTICS_RETENTION_DAYS,
  countExpiredClientDiagnostics,
  deleteExpiredClientDiagnostics,
  diagnosticRetentionCutoffMs
} from '~/repositories/clientDiagnosticsRepository'

const DAY_MS = 24 * 60 * 60 * 1000

function diagnosticRefs(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    ref: { path: `users/pilot/diagnostics/event-${offset + index}` }
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
    await expect(countExpiredClientDiagnostics(1234, loadCount)).resolves.toBe(0)
    expect(loadCount).toHaveBeenCalledWith(1234)
  })

  it('elimina oltre 200 documenti in batch successivi fino a esaurimento', async () => {
    const loadBatch = vi.fn()
      .mockResolvedValueOnce({ docs: diagnosticRefs(200) })
      .mockResolvedValueOnce({ docs: diagnosticRefs(3, 200) })
      .mockResolvedValueOnce({ docs: [] })
    const deleteBatch = vi.fn().mockResolvedValue(undefined)

    await expect(deleteExpiredClientDiagnostics({
      cutoffMs: 1234,
      loadBatch,
      deleteBatch
    })).resolves.toBe(203)

    expect(loadBatch).toHaveBeenCalledTimes(3)
    expect(loadBatch).toHaveBeenNthCalledWith(1, 1234, CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE)
    expect(deleteBatch).toHaveBeenCalledTimes(2)
    expect(deleteBatch.mock.calls[0][0]).toHaveLength(200)
    expect(deleteBatch.mock.calls[1][0]).toHaveLength(3)
  })

  it('non esegue scritture quando non ci sono documenti scaduti', async () => {
    const deleteBatch = vi.fn()
    await expect(deleteExpiredClientDiagnostics({
      loadBatch: vi.fn().mockResolvedValue({ docs: [] }),
      deleteBatch
    })).resolves.toBe(0)
    expect(deleteBatch).not.toHaveBeenCalled()
  })
})
