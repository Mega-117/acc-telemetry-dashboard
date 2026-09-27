import { beforeEach, describe, expect, it, vi } from 'vitest'
const get = vi.hoisted(() => vi.fn())
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDocs: get }))
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn(), documentId: vi.fn() }))
import { loadAdminActivityIndexes, summarizeAdminActivity } from '~/repositories/adminActivityRepository'
const now = Date.parse('2026-09-27T12:00:00Z')
describe('admin activity rolling window', () => {
  beforeEach(() => { get.mockReset() })
  it('expires old sessions without any writes and ignores future dates', () => {
    const index = { totalSessions: 2, sessionsList: [{ id: 'a', date: '2026-09-21T12:00:00Z' }, { id: 'b', date: '2026-09-27T10:00:00Z' }] }
    expect(summarizeAdminActivity(index, now)).toMatchObject({ count: 2, partial: false })
    expect(summarizeAdminActivity(index, now + 8 * 86400000)).toMatchObject({ count: 0, partial: false })
    expect(summarizeAdminActivity(index, now - 86400000)).toMatchObject({ count: 1, partial: true })
  })
  it('distinguishes absent, incomplete and complete indexes', () => {
    expect(summarizeAdminActivity(null, now).count).toBeNull()
    expect(summarizeAdminActivity({ totalSessions: 0, sessionsList: [] }, now)).toMatchObject({ count: 0, partial: false })
    expect(summarizeAdminActivity({ totalSessions: 400, sessionsList: [{ date: '2026-09-26' }] }, now).partial).toBe(true)
    expect(summarizeAdminActivity({ totalSessions: 400, sessionsList: [{ date: '2026-09-26' }, { date: '2026-09-01' }] }, now)).toMatchObject({ count: 1, partial: false })
  })
  it('deduplicates session IDs and preserves uncertainty for invalid dates', () => {
    expect(summarizeAdminActivity({ totalSessions: 1, sessionsList: [{ id: 'a', date: '2026-09-26' }, { id: 'a', date: '2026-09-26' }] }, now).count).toBe(1)
    expect(summarizeAdminActivity({ totalSessions: 1, sessionsList: [{ date: 'invalid' }] }, now).partial).toBe(true)
  })
  it('reuses bounded viewer cache, expires and never shares across accounts', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    get.mockResolvedValue({ docs: [{ id: 'a', data: () => ({ sessionIndex: { totalSessions: 0, sessionsList: [] } }) }] })
    expect((await loadAdminActivityIndexes('viewer1', ['a', 'a', 'missing'])).get('missing')).toBeNull()
    await loadAdminActivityIndexes('viewer1', ['a'])
    expect(get).toHaveBeenCalledTimes(1)
    clock.mockReturnValue(now + 300001)
    await loadAdminActivityIndexes('viewer1', ['a'])
    await loadAdminActivityIndexes('viewer2', ['a'])
    expect(get).toHaveBeenCalledTimes(3)
    clock.mockRestore()
  })
  it('discards an old account response when a new viewer starts', async () => {
    let release!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
      .mockResolvedValue({ docs: [] })
    const pending = loadAdminActivityIndexes('old-viewer', ['a'])
    await loadAdminActivityIndexes('new-viewer', ['b'])
    release({ docs: [] })
    expect((await pending).size).toBe(0)
  })
})
