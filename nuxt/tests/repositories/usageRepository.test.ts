import { describe, expect, it, vi } from 'vitest'
vi.mock('../../app/config/firebase', () => ({ db: {} }))
vi.mock('../../app/composables/useFirebaseTracker', () => ({ trackedGetDocs: vi.fn() }))
vi.mock('../../app/services/usage/usageClient', () => ({ usageRequest: vi.fn() }))
import { loadUsage, loadUsageDetails } from '../../app/repositories/usageRepository'
describe('usage pagination', () => {
  it('loads every page and deduplicates repeated keys before publishing', async () => {
    const request = vi.fn().mockResolvedValueOnce({ objects: [{ key: 'a', uid: 'pilot', summary: null }], truncated: true, cursor: 'next' })
      .mockResolvedValueOnce({ objects: [{ key: 'a', uid: 'pilot', summary: null }, { key: 'b', uid: 'pilot', summary: null }], truncated: false })
    expect(await loadUsage(['2026-10-19'], request)).toHaveLength(2)
    expect(request.mock.calls[1]?.[0]).toContain('cursor=next')
  })
  it('refuses a silent partial total if a page fails or its cursor loops', async () => {
    const looping = vi.fn().mockResolvedValue({ objects: [], truncated: true, cursor: 'same' })
    await expect(loadUsage(['2026-10-19'], looping)).rejects.toThrow('incompleta')
    await expect(loadUsage(['2026-10-19'], vi.fn().mockRejectedValue(Error('offline')))).rejects.toThrow('offline')
  })
  it('fetches only selected detail keys', async () => {
    const request = vi.fn().mockResolvedValue({ sessions: [] })
    await loadUsageDetails([{ key: 'usage/a', uid: 'pilot', summary: null }], request)
    expect(request).toHaveBeenCalledExactlyOnceWith('/v1/admin/usage/detail?key=usage%2Fa')
  })
})
