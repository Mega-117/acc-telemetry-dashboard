import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_: unknown, path: string) => path, collection: vi.fn(), query: vi.fn() }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: mocks.get, trackedGetDocs: vi.fn() }))
import { clearTelemetryProjectionRepositoryCache, loadOverviewSessionSummary } from '~/repositories/telemetryProjectionRepository'

beforeEach(() => { clearTelemetryProjectionRepositoryCache(); mocks.get.mockReset() })
it('reads one summary document and caches it per user and session', async () => {
  const summary = { best_qualy_ms: 90000 }
  mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ summary }) })
  expect(await loadOverviewSessionSummary('qa-a', 'last')).toEqual(summary)
  expect(await loadOverviewSessionSummary('qa-a', 'last')).toEqual(summary)
  expect(mocks.get).toHaveBeenCalledTimes(1)
  expect(mocks.get).toHaveBeenCalledWith('users/qa-a/sessions/last', 'TelemetryProjectionRepository')
  await loadOverviewSessionSummary('qa-b', 'last')
  expect(mocks.get).toHaveBeenCalledTimes(2)
  clearTelemetryProjectionRepositoryCache('qa-a')
  await loadOverviewSessionSummary('qa-b', 'last')
  await loadOverviewSessionSummary('qa-a', 'last')
  expect(mocks.get).toHaveBeenCalledTimes(3)
})
it('represents a missing summary honestly and propagates read failures to retry UI', async () => {
  mocks.get.mockResolvedValueOnce({ exists: () => false }).mockRejectedValueOnce(new Error('offline'))
  expect(await loadOverviewSessionSummary('qa', 'missing')).toBeNull()
  await expect(loadOverviewSessionSummary('qa', 'error')).rejects.toThrow('offline')
})
