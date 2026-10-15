import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), count: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDocs: mocks.getDocs, trackedGetCountFromServer: mocks.count }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn()
}))
import { countPilotDirectory, loadPilotDirectoryPage, mapPilotDirectoryDocument } from '~/repositories/pilotDirectoryRepository'

const docSnap = (id: string, data: Record<string, unknown>) => ({ id, data: () => data })

describe('pilot directory mapping', () => {
  it('keeps a missing 7-day count missing instead of turning it into zero', () => {
    expect(mapPilotDirectoryDocument(docSnap('a', {})).totalSessions).toBeUndefined()
    expect(mapPilotDirectoryDocument(docSnap('a', { sessionsLast7Days: null })).totalSessions).toBeUndefined()
    expect(mapPilotDirectoryDocument(docSnap('a', { sessionsLast7Days: 'x' })).totalSessions).toBeUndefined()
  })

  it('keeps a real zero and a real count', () => {
    expect(mapPilotDirectoryDocument(docSnap('a', { sessionsLast7Days: 0 })).totalSessions).toBe(0)
    expect(mapPilotDirectoryDocument(docSnap('a', { sessionsLast7Days: 4 })).totalSessions).toBe(4)
  })

  it('maps identity, last session and health fields with safe fallbacks', () => {
    const pilot = mapPilotDirectoryDocument(docSnap('u1', {
      lastSessionDate: '2026-10-14', firebaseHealthMigrationVersion: '3', suiteVersion: '0.4.5'
    }))
    expect(pilot).toMatchObject({ uid: 'u1', nickname: 'Utente', role: 'pilot', lastSession: '2026-10-14',
      firebaseHealthMigrationVersion: 3, suiteVersion: '0.4.5' })
    expect(mapPilotDirectoryDocument(docSnap('u1', { firebaseHealthMigrationVersion: 'n/a' })).firebaseHealthMigrationVersion).toBeUndefined()
  })
})

describe('pilot directory paging', () => {
  beforeEach(() => { mocks.getDocs.mockReset(); mocks.count.mockReset() })

  it('hides the admin from the admin list and reports the next page', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [docSnap('admin', {}), docSnap('p1', {}), docSnap('p2', {}), docSnap('p3', {})] })
    const page = await loadPilotDirectoryPage({ role: 'admin', currentUserId: 'admin', pageSize: 2 })
    expect(page.pilots.map((pilot) => pilot.uid)).toEqual(['p1', 'p2'])
    expect(page.hasNext).toBe(true)
  })

  it('subtracts the admin from the unfiltered admin count only', async () => {
    mocks.count.mockResolvedValue({ data: () => ({ count: 5 }) })
    expect(await countPilotDirectory({ role: 'admin', currentUserId: 'admin' })).toBe(4)
    expect(await countPilotDirectory({ role: 'admin', currentUserId: 'admin', searchTerm: 'ric' })).toBe(5)
    expect(await countPilotDirectory({ role: 'coach', currentUserId: 'c' })).toBe(5)
  })
})
